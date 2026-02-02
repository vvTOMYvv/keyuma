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

            submitBtn.innerText = "診断中...";
            submitBtn.disabled = true;

            const getVal = (id) => {
                const el = document.getElementById(id);
                if (!el) return null;
                const val = el.value;
                // 空文字やデフォルトのラベル、"全選択"などはnullとして扱う
                if (val === "" || val === "全選択" || val.includes('選択')) return null;
                return val;
            };

            // 10項目のフィルタ条件を収集
            const payload = {
                jiku: parseInt(document.querySelector('input[name="jiku"]:checked').value),
                aite_list: selectedAite,
                // メイン4
                venue: getVal('venue'),
                course_type: getVal('course_type'),
                distance: getVal('distance') ? parseInt(getVal('distance')) : null,
                class: getVal('class'),
                // 詳細6
                year: getVal('year') ? parseInt(getVal('year')) : null,
                month: getVal('month') ? parseInt(getVal('month')) : null,
                track: getVal('track'),
                age: getVal('age'),
                race_condition: getVal('race_condition'),
                num_runners: getVal('num_runners') ? parseInt(getVal('num_runners')) : null
            };

            // nullのプロパティを除去して軽量化
            Object.keys(payload).forEach(key => payload[key] === null && delete payload[key]);

            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (!response.ok) throw new Error('API Error');
                const result = await response.json();
                
                // 結果をローカルストレージに保存して遷移
                localStorage.setItem('analysisResult', JSON.stringify({ input: payload, output: result }));
                window.location.href = 'result.html';
                
            } catch (error) {
                console.error(error);
                alert('データの取得に失敗しました。一時的な通信エラーの可能性があります。');
                submitBtn.innerText = "期待値を診断する";
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

        // 選択された条件のバッジ反映
        setTxt('res-jiku', input.jiku, '番人気');
        setTxt('res-pair', aiteCount > 0 ? input.aite_list.sort((a,b)=>a-b).join(', ') + '番人気' : 'なし');
        setTxt('res-venue', input.venue);
        setTxt('res-course_type', input.course_type);
        setTxt('res-distance', input.distance, 'm');
        setTxt('res-class', input.class);
        setTxt('res-year', input.year, '年');
        setTxt('res-month', input.month, '月');
        setTxt('res-track', input.track);
        setTxt('res-age', input.age);
        setTxt('res-race_condition', input.race_condition);
        setTxt('res-num_runners', input.num_runners, '頭以上');
        setTxt('res-count', output.race_count, '');

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

                if (probEl) probEl.innerText = `${((hit || 0) * 100).toFixed(2)}%`;
                if (retEl) retEl.innerText = `${((roi || 0) * 100).toFixed(1)}`;
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