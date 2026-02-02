document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('analysis-form');
    const jikuGroup = document.getElementById('jiku-group');
    const aiteGroup = document.getElementById('aite-group');
    const API_URL = 'https://netkeiba-results-759522910706.asia-northeast1.run.app';

    // --- 1. グリッド選択肢の生成 ---
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

    generateGrid(jikuGroup, 'jiku', 'radio', 1);
    generateGrid(aiteGroup, 'aite', 'checkbox');

    // --- 2. 分析実行処理 (index.html用) ---
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submit-btn');
            const selectedAite = Array.from(document.querySelectorAll('input[name="aite"]:checked')).map(cb => parseInt(cb.value));

            submitBtn.innerText = "診断中...";
            submitBtn.disabled = true;

            const getVal = (id) => {
                const el = document.getElementById(id);
                // "全選択" や空文字、または初期ラベルの場合はnullを返す
                if (!el || el.value === "全選択" || el.value === "" || el.options?.[el.selectedIndex]?.text.includes('選択')) return null;
                return el.value;
            };

            // メイン4（会場、コース、距離、クラス）+ 詳細6（年、月、馬場、年齢、斤量、頭数）
            const payload = {
                jiku: parseInt(document.querySelector('input[name="jiku"]:checked').value),
                aite_list: selectedAite, 
                // メイン4
                venue: getVal('venue'),
                course_type: getVal('course_type'), // コース（芝・ダート）
                distance: getVal('distance') ? parseInt(getVal('distance')) : null,
                class: getVal('class'),
                // 詳細6
                year: getVal('year') ? parseInt(getVal('year')) : null,
                month: getVal('month') ? parseInt(getVal('month')) : null,
                track: getVal('track'),             // 馬場（良・重など）
                age: getVal('age'),
                race_condition: getVal('race_condition'), // 斤量
                num_runners: getVal('num_runners') ? parseInt(getVal('num_runners')) : null // 頭数
            };

            // nullの値を削除
            Object.keys(payload).forEach(key => payload[key] === null && delete payload[key]);

            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (!response.ok) throw new Error('API Error');
                const result = await response.json();
                
                localStorage.setItem('analysisResult', JSON.stringify({ input: payload, output: result }));
                window.location.href = 'result.html';
                
            } catch (error) {
                console.error(error);
                alert('データの取得に失敗しました。');
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

        const setTxt = (id, val, suffix = '') => {
            const el = document.getElementById(id);
            if (el) el.innerText = (val !== undefined && val !== null) ? `${val}${suffix}` : '全選択';
        };

        // 入力条件の反映（10項目）
        setTxt('res-jiku', input.jiku, '番人気');
        setTxt('res-pair', (input.aite_list && input.aite_list.length > 0) ? input.aite_list.join(', ') + '番人気' : 'なし');
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
        setTxt('res-count', output.race_count, 'レース');

        // 馬券結果の反映（中央値対応）
        const setRes = (probId, retId, medianId, hit, roi, median) => {
            const pEl = document.getElementById(probId);
            const rEl = document.getElementById(retId);
            const mEl = document.getElementById(medianId);
            if (pEl) pEl.innerText = `${((hit || 0) * 100).toFixed(2)}%`;
            if (rEl) rEl.innerText = `${((roi || 0) * 100).toFixed(1)}`;
            if (mEl) mEl.innerText = median ? Math.floor(median).toLocaleString() : '-';
        };

        setRes('win-prob', 'win-return', 'win-median', output.win_hit, output.win_roi, output.win_median);
        setRes('place-prob', 'place-return', 'place-median', output.place_hit, output.place_roi, output.place_median);
        setRes('ren-prob', 'ren-return', 'ren-median', output.quinella_hit, output.quinella_roi, output.quinella_median);
        setRes('wide-prob', 'wide-return', 'wide-median', output.wide_hit, output.wide_roi, output.wide_median);
        setRes('tan-prob', 'tan-return', 'tan-median', output.exacta_hit, output.exacta_roi, output.exacta_median);
        setRes('fuku3-prob', 'fuku3-return', 'fuku3-median', output.trio_hit, output.trio_roi, output.trio_median);
        setRes('fuku3tan-prob', 'fuku3tan-return', 'fuku3tan-median', output.trifecta_hit, output.trifecta_roi, output.trifecta_median);
    }
});