document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('analysis-form');
    const jikuGroup = document.getElementById('jiku-group');
    const aiteGroup = document.getElementById('aite-group');
    const API_URL = 'https://netkeiba-results-759522910706.asia-northeast1.run.app';

    // --- 1. グリッド選択肢の生成 (index.html用) ---
    const generateGrid = (container, name, type, defaultVal = null) => {
        if (!container) return;
        for (let i = 1; i <= 18; i++) {
            const div = document.createElement('div');
            div.className = 'selection-item';
            const isChecked = (i === defaultVal) ? 'checked' : '';
            div.innerHTML = `
                <input type="${type}" id="${name}-${i}" name="${name}" value="${i}" ${isChecked}>
                <label for="${name}-${i}">${i}<span>番人気</span></label>
            `;
            container.appendChild(div);
        }
    };

    if (jikuGroup) generateGrid(jikuGroup, 'jiku', 'radio', 1);
    if (aiteGroup) generateGrid(aiteGroup, 'aite', 'checkbox');

    // --- 2. 分析実行処理 (index.html用) ---
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();            
            const submitBtn = document.getElementById('submit-btn');
            
            // 相手馬の選択リスト取得
            const selectedAite = Array.from(document.querySelectorAll('input[name="aite"]:checked'))
                .map(cb => parseInt(cb.value));

            // ★【修正箇所1】タイマーの変数を定義して開始する
            submitBtn.disabled = true;
            let dotCount = 0;
            const loadingInterval = setInterval(() => {
                dotCount = (dotCount + 1) % 4;
                submitBtn.innerText = "計算中" + ".".repeat(dotCount);
            }, 300);

            const getVal = (id) => {
                const el = document.getElementById(id);
                if (!el) return null;
                const val = el.value;
                if (val === "" || val === "全選択" || val.includes('選択')) return null;
                return val;
            };

            // 判定用の値を取得しておく
            const runnersType = getVal('num_runners');
            const distType = getVal('distance');

            const payload = {
                jiku: parseInt(document.querySelector('input[name="jiku"]:checked').value),
                aite_list: selectedAite,
                venue: getVal('venue'),
                course_type: getVal('course_type'),
                distance_min: distType === 'sprint' ? 1000 : (distType === 'mile' ? 1400 : (distType === 'intermediate' ? 1900 : (distType === 'stay' ? 2500 : null))),
                distance_max: distType === 'sprint' ? 1300 : (distType === 'mile' ? 1800 : (distType === 'intermediate' ? 2400 : (distType === 'stay' ? 5000 : null))),
                
                class: getVal('class'),
                year: getVal('year') ? parseInt(getVal('year')) : null,
                month: getVal('month') ? parseInt(getVal('month')) : null,
                track: getVal('track'),
                age: getVal('age'),
                race_condition: getVal('race_condition'),
                
                num_runners_min: runnersType === 'large' ? 15 : (runnersType === 'medium' ? 10 : (runnersType === 'small' ? 5 : null)),
                num_runners_max: runnersType === 'large' ? 18 : (runnersType === 'medium' ? 14 : (runnersType === 'small' ? 9 : null))
            };

            Object.keys(payload).forEach(key => payload[key] === null && delete payload[key]);

            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (!response.ok) throw new Error('API Error');
                const result = await response.json();
                
                // ★【修正箇所2】成功時：遷移する前にタイマーを止める
                clearInterval(loadingInterval);
                localStorage.setItem('analysisResult', JSON.stringify({ input: payload, output: result }));
                window.location.href = 'result.html';
                
            } catch (error) {
                console.error(error);
                // ★【修正箇所3】失敗時：タイマーを止めてボタンを元に戻す
                clearInterval(loadingInterval);
                alert('データの取得に失敗しました。一時的な通信エラーの可能性があります。');
                submitBtn.innerText = "期待値を計算する";
                submitBtn.disabled = false;
            }
        });
    }

    // --- 3. 結果画面表示 (result.html用) ---
    if (window.location.pathname.includes('result.html')) {
        const storageData = JSON.parse(localStorage.getItem('analysisResult'));
        if (!storageData) return;

        const { input, output } = storageData;
        const aiteCount = input.aite_list ? input.aite_list.length : 0;

        const setTxt = (id, val, suffix = '') => {
            const el = document.getElementById(id);
            if (el) el.innerText = (val !== undefined && val !== null) ? `${val}${suffix}` : '全選択';
        };

        /* --- 追加：表示名変換用のマッピング --- */
        const distanceMap = {
            'sprint': 'スプリント (1000-1300m)',
            'mile': 'マイル (1400-1800m)',
            'intermediate': '中距離 (1900-2400m)',
            'stay': '長距離 (2500m以上)'
        };

        const runnersMap = {
            'large': '多頭数 (15頭以上)',
            'medium': '中規模 (10-14頭)',
            'small': '小頭数 (5-9頭)'
        };

        // 選択された条件のバッジ反映
        setTxt('res-jiku', input.jiku, '番人気');
        setTxt('res-pair', aiteCount > 0 ? input.aite_list.sort((a,b)=>a-b).join(', ') + '番人気' : 'なし');
        setTxt('res-venue', input.venue);
        setTxt('res-course_type', input.course_type);
        setTxt('res-class', input.class);
        setTxt('res-year', input.year, '年');
        setTxt('res-month', input.month, '月');
        setTxt('res-track', input.track);
        setTxt('res-age', input.age);
        setTxt('res-race_condition', input.race_condition);
        setTxt('res-count', output.race_count, '');
        // distance_min/maxではなく、localStorageに保存した時の元の選択値（distType/runnersType）を参照します
        const rawDist = input.distance_min ? (input.distance_min === 1000 ? 'sprint' : input.distance_min === 1400 ? 'mile' : input.distance_min === 1900 ? 'intermediate' : 'stay') : null;
        const rawRunners = input.num_runners_min ? (input.num_runners_min === 15 ? 'large' : input.num_runners_min === 10 ? 'medium' : 'small') : null;

        setTxt('res-distance', rawDist ? distanceMap[rawDist] : '全距離');
        setTxt('res-num-runners', rawRunners ? runnersMap[rawRunners] : '全頭数');

        /**
         * 各馬券カードの表示制御
         * @param {string} idPrefix IDのプレフィックス (win, ren, fuku3など)
         * @param {number} minAiteRequired 必要な最低相手数
         * @param {number} hit 的中率
         * @param {number} roi 回収率
         * @param {number} median 中央値
         */
        const renderResultCard = (idPrefix, minAiteRequired, hit, roi, median) => {
            const cardEl = document.getElementById(`card-${idPrefix}`);
            const groupEl = document.getElementById(`group-${idPrefix}`);
            const errorEl = document.getElementById(`error-${idPrefix}`);
            
            const probEl = document.getElementById(`${idPrefix}-prob`);
            const retEl = document.getElementById(`${idPrefix}-return`);
            const medEl = document.getElementById(`${idPrefix}-median`);

            if (aiteCount < minAiteRequired) {
                // 条件（相手数）を満たさない場合：メッセージを表示してグレーアウト
                if (cardEl) cardEl.classList.add('is-disabled');
                if (groupEl) groupEl.style.display = 'none';
                if (errorEl) errorEl.style.display = 'block';
            } else {
                // 条件を満たす場合：数値を反映
                if (cardEl) cardEl.classList.remove('is-disabled');
                if (groupEl) groupEl.style.display = 'flex';
                if (errorEl) errorEl.style.display = 'none';

                if (probEl) probEl.innerText = `${((hit || 0) * 100).toFixed(2)}`;
                if (retEl) retEl.innerText = `${((roi || 0) * 100).toFixed(2)}`;
                if (medEl) medEl.innerText = median ? Math.floor(median).toLocaleString() : '-';
            }
        };

        // 各馬券種の表示実行
        renderResultCard('win', 0, output.win_hit, output.win_roi, output.win_median);
        renderResultCard('place', 0, output.place_hit, output.place_roi, output.place_median);
        renderResultCard('ren', 1, output.quinella_hit, output.quinella_roi, output.quinella_median);
        renderResultCard('wide', 1, output.wide_hit, output.wide_roi, output.wide_median);
        renderResultCard('tan', 1, output.exacta_hit, output.exacta_roi, output.exacta_median);
        renderResultCard('fuku3', 2, output.trio_hit, output.trio_roi, output.trio_median);
        renderResultCard('fuku3tan', 2, output.trifecta_hit, output.trifecta_roi, output.trifecta_median);
    }
});