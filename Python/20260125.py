import functions_framework
from google.cloud import bigquery
from flask import jsonify

@functions_framework.http
def race_analysis_api(request):
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
        return ('', 204, headers)

    headers = {'Access-Control-Allow-Origin': '*'}
    
    try:
        data = request.get_json(silent=True) or {}
        jiku = int(data.get('jiku', 1))
        aite_list = data.get('aite_list', [])
        
        if not isinstance(aite_list, list):
            aite_list = [int(aite_list)] if str(aite_list).isdigit() else []
        else:
            aite_list = [int(x) for x in aite_list if str(x).isdigit()]

        client = bigquery.Client(project="sql-book-386003")
        where_clauses = ["1=1"]
        query_params = [bigquery.ScalarQueryParameter("jiku", "INT64", jiku)]

        # 期待される mapping の状態
        mapping = {
            'venue': 'venue',             # 東京, 中山 等
            'track': 'track',             # 良, 稍, 重, 不
            'course_type': 'course_type', # 芝, ダート, 障害
            'distance': 'distance',       # 距離
            'age': 'age',                 # ２歳, ３歳以上 等
            'class': 'class',             # オープン, 未勝利 等
            'race_condition': 'race_condition' # 定量, ハンデ 等
        }

        for key, col in mapping.items():
            val = data.get(key)
            if val is not None and val not in ["", "未選択", "全選択", "N/A"]:
                where_clauses.append(f"{col} = @{key}")
                # 数値カラムかどうかの判定を強化
                is_numeric_col = key in ['distance', 'num_runners', 'race_day_count']
                if is_numeric_col or (isinstance(val, str) and val.isdigit()):
                    query_params.append(bigquery.ScalarQueryParameter(key, "INT64", int(val)))
                else:
                    query_params.append(bigquery.ScalarQueryParameter(key, "STRING", str(val)))

        where_sql = " AND ".join(where_clauses)

        # デフォルト初期値
        q_roi, q_hit = "0", "0"
        e_roi, e_hit = "0", "0"
        w_roi, w_hit = "0", "0"
        t_roi, t_hit = "0", "0"
        tf_roi, tf_hit = "0", "0"

        if aite_list:
            n = len(aite_list)
            query_params.append(bigquery.ArrayQueryParameter("aite_list", "INT64", aite_list))
            
            # --- 馬連・馬単・ワイドは前回一致したので維持 ---
            q_roi = f"SAFE_DIVIDE(SUM(CASE WHEN (place1_popularity = @jiku AND place2_popularity IN UNNEST(@aite_list)) OR (place2_popularity = @jiku AND place1_popularity IN UNNEST(@aite_list)) THEN quinella ELSE 0 END), COUNT(*) * 100 * {n})"
            q_hit = f"SAFE_DIVIDE(SUM(CASE WHEN (place1_popularity = @jiku AND place2_popularity IN UNNEST(@aite_list)) OR (place2_popularity = @jiku AND place1_popularity IN UNNEST(@aite_list)) THEN 1 ELSE 0 END), COUNT(*))"
            
            e_roi = f"SAFE_DIVIDE(SUM(CASE WHEN place1_popularity = @jiku AND place2_popularity IN UNNEST(@aite_list) THEN exacta ELSE 0 END), COUNT(*) * 100 * {n})"
            e_hit = f"SAFE_DIVIDE(SUM(CASE WHEN place1_popularity = @jiku AND place2_popularity IN UNNEST(@aite_list) THEN 1 ELSE 0 END), COUNT(*))"
            
            w_roi = f"""SAFE_DIVIDE(SUM(
                (CASE WHEN (place1_popularity = @jiku AND place2_popularity IN UNNEST(@aite_list)) OR (place2_popularity = @jiku AND place1_popularity IN UNNEST(@aite_list)) THEN wide1_2 ELSE 0 END) +
                (CASE WHEN (place1_popularity = @jiku AND place3_popularity IN UNNEST(@aite_list)) OR (place3_popularity = @jiku AND place1_popularity IN UNNEST(@aite_list)) THEN wide1_3 ELSE 0 END) +
                (CASE WHEN (place2_popularity = @jiku AND place3_popularity IN UNNEST(@aite_list)) OR (place3_popularity = @jiku AND place2_popularity IN UNNEST(@aite_list)) THEN wide2_3 ELSE 0 END)
            ), COUNT(*) * 100 * {n})"""
            w_hit = f"""SAFE_DIVIDE(SUM(
                (CASE WHEN (place1_popularity = @jiku AND place2_popularity IN UNNEST(@aite_list)) OR (place2_popularity = @jiku AND place1_popularity IN UNNEST(@aite_list)) THEN 1 ELSE 0 END) +
                (CASE WHEN (place1_popularity = @jiku AND place3_popularity IN UNNEST(@aite_list)) OR (place3_popularity = @jiku AND place1_popularity IN UNNEST(@aite_list)) THEN 1 ELSE 0 END) +
                (CASE WHEN (place2_popularity = @jiku AND place3_popularity IN UNNEST(@aite_list)) OR (place3_popularity = @jiku AND place2_popularity IN UNNEST(@aite_list)) THEN 1 ELSE 0 END)
            ), COUNT(*))"""

            if n >= 2:
                # --- 3連単 (nP2点) ここがBQで成功した式 ---
                tf_comb = n * (n - 1)
                tf_roi = f"""SAFE_DIVIDE(SUM(
                    CASE WHEN place1_popularity = @jiku 
                         AND place2_popularity IN UNNEST(@aite_list) 
                         AND place3_popularity IN UNNEST(@aite_list) 
                    THEN trifecta ELSE 0 END
                ), COUNT(*) * 100 * {tf_comb})"""
                
                # 的中率も延べ的中数（Lookerの合計）に合わせるためSUM(CASE...1)に変更
                tf_hit = f"""SAFE_DIVIDE(SUM(
                    CASE WHEN place1_popularity = @jiku 
                         AND place2_popularity IN UNNEST(@aite_list) 
                         AND place3_popularity IN UNNEST(@aite_list) 
                    THEN 1 ELSE 0 END
                ), COUNT(*))"""

                # --- 3連複 (nC2点) も同様に修正 ---
                trio_comb = (n * (n - 1)) // 2
                t_roi = f"""SAFE_DIVIDE(SUM(
                    CASE WHEN @jiku IN (place1_popularity, place2_popularity, place3_popularity) 
                         AND (SELECT COUNTIF(p IN UNNEST(@aite_list)) FROM UNNEST([place1_popularity, place2_popularity, place3_popularity]) as p) >= 2 
                    THEN trifecta_box ELSE 0 END
                ), COUNT(*) * 100 * {trio_comb})"""
                t_hit = f"""SAFE_DIVIDE(SUM(
                    CASE WHEN @jiku IN (place1_popularity, place2_popularity, place3_popularity) 
                         AND (SELECT COUNTIF(p IN UNNEST(@aite_list)) FROM UNNEST([place1_popularity, place2_popularity, place3_popularity]) as p) >= 2 
                    THEN 1 ELSE 0 END
                ), COUNT(*))"""

        query = f"""
        SELECT 
            COUNT(*) as race_count,
            ROUND(SAFE_DIVIDE(SUM(CASE WHEN place1_popularity = @jiku THEN win_odds ELSE 0 END), COUNT(*) * 100), 4) as win_roi,
            ROUND(SAFE_DIVIDE(COUNTIF(place1_popularity = @jiku), COUNT(*)), 4) as win_hit,
            ROUND(SAFE_DIVIDE(SUM(CASE 
                WHEN place1_popularity = @jiku THEN place1_odds 
                WHEN place2_popularity = @jiku THEN place2_odds 
                WHEN place3_popularity = @jiku THEN place3_odds 
                ELSE 0 END), COUNT(*) * 100), 4) as place_roi,
            ROUND(SAFE_DIVIDE(COUNTIF(@jiku IN (place1_popularity, place2_popularity, place3_popularity)), COUNT(*)), 4) as place_hit,
            ROUND({q_roi}, 4) as quinella_roi, ROUND({q_hit}, 4) as quinella_hit,
            ROUND({e_roi}, 4) as exacta_roi, ROUND({e_hit}, 4) as exacta_hit,
            ROUND({w_roi}, 4) as wide_roi, ROUND({w_hit}, 4) as wide_hit,
            ROUND({t_roi}, 4) as trio_roi, ROUND({t_hit}, 4) as trio_hit,
            ROUND({tf_roi}, 4) as trifecta_roi, ROUND({tf_hit}, 4) as trifecta_hit
        FROM `sql-book-386003.netkeiba_results_list.summary`
        WHERE {where_sql}
        """

        query_job = client.query(query, job_config=bigquery.QueryJobConfig(query_parameters=query_params))
        res = [dict(r) for r in query_job.result()]
        return jsonify(res[0] if res else {}), 200, headers

    except Exception as e:
        return jsonify({'error': str(e)}), 500, headers