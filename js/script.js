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
                <label for="${name}-${i}">${i}</label>
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
                if (!el || el.value === "全選択" || el.value === "") return null;
                return el.value;
            };

            const payload = {
                jiku: parseInt(document.querySelector('input[name="jiku"]:checked').value),
                aite_list: selectedAite, 
                venue: getVal('venue'),
                track: getVal('track'),
                course_type: getVal('course_type'),
                age: getVal('age'),
                class: getVal('class'),
                race_condition: getVal('race_condition'),
                distance: getVal('distance') ? parseInt(getVal('distance')) : null
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

        // 補助関数: 要素にテキストをセットする
        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val !== undefined && val !== null ? val : '全選択';
        };

        // 条件の反映 (HTMLの各IDに流し込む)
        setTxt('res-jiku', input.jiku);
        setTxt('res-pair', input.aite_list && input.aite_list.length > 0 ? input.aite_list.join(', ') : 'なし');
        setTxt('res-venue', input.venue);
        setTxt('res-course_type', input.course_type);
        setTxt('res-distance', input.distance ? `${input.distance}m` : '全距離');
        setTxt('res-track', input.track);
        setTxt('res-age', input.age);
        setTxt('res-class', input.class);
        setTxt('res-race_condition', input.race_condition);
        setTxt('res-count', output.race_count || 0);

        // 馬券結果の反映
        const setRes = (probId, retId, hit, roi) => {
            const pEl = document.getElementById(probId);
            const rEl = document.getElementById(retId);
            if (pEl) pEl.innerText = `${((hit || 0) * 100).toFixed(2)}%`;
            if (rEl) rEl.innerText = `${((roi || 0) * 100).toFixed(1)}`;
        };

        setRes('win-prob', 'win-return', output.win_hit, output.win_roi);
        setRes('place-prob', 'place-return', output.place_hit, output.place_roi);
        setRes('ren-prob', 'ren-return', output.quinella_hit, output.quinella_roi);
        setRes('wide-prob', 'wide-return', output.wide_hit, output.wide_roi);
        setRes('tan-prob', 'tan-return', output.exacta_hit, output.exacta_roi);
        setRes('fuku3-prob', 'fuku3-return', output.trio_hit, output.trio_roi);
        setRes('fuku3tan-prob', 'fuku3tan-return', output.trifecta_hit, output.trifecta_roi);
    }
});