chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'askAI') return false;
  (async () => {
    const { endpoint, key, model, soal, opsis } = msg;
    if (!endpoint || !key || !model) { sendResponse({ error: 'AI belum dikonfigurasi' }); return; }
    const huruf = ['A', 'B', 'C', 'D', 'E'];
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(45000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model, temperature: 0, max_tokens: 500,
          messages: [{ role: 'user', content: `Soal pilihan ganda:\n${soal}\n${opsis.map((t, i) => `${huruf[i]}. ${t}`).join('\n')}\nJawab hanya dengan satu huruf A-E, tanpa penjelasan.` }],
        }),
      });
      const text = await r.text();
      let raw = '';
      let j = null;
      try { j = JSON.parse(text); } catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) { try { j = JSON.parse(m[0]); } catch { /* fallback */ } }
      }
      if (j) {
        raw = j.choices?.[0]?.message?.content || '';
      } else if (text.includes('data:')) {
          for (const ln of text.split('\n')) {
            const t = ln.trim().replace(/^data:\s*/, '');
            if (!t || t === '[DONE]') continue;
            try {
              const p = JSON.parse(t);
              raw += p.choices?.[0]?.delta?.content || p.choices?.[0]?.message?.content || '';
            } catch { /* abaikan potongan rusak */ }
          }
        } else {
          const m = text.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
          if (m) { try { raw = JSON.parse(`"${m[1]}"`); } catch { raw = m[1]; } }
        }
      if (!raw) { sendResponse({ error: 'non-JSON: ' + text.slice(0, 300) }); return; }
      const stood = raw.toUpperCase().match(/\b[A-E]\b/g);
      const txt = stood ? stood[stood.length - 1] : raw.toUpperCase().match(/[A-E]/)?.[0];
      if (!txt) { sendResponse({ error: 'respon aneh: ' + JSON.stringify(j).slice(0, 200) }); return; }
      sendResponse({ idx: huruf.indexOf(txt), letter: txt });
    } catch (e) { sendResponse({ error: String(e.message || e) }); }
  })();
  return true;
});
