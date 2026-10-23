from pathlib import Path
import re
p=Path(__file__).resolve().parents[1]
html=(p/'index.html').read_text(encoding='utf-8')
js=(p/'app.js').read_text(encoding='utf-8')
ids=set(re.findall(r'id="([^"]+)"',html))
called=set(re.findall(r"\$\('([^']+)'\)",js))
missing=sorted(called-ids)
assert not missing, f'Missing HTML elements: {missing}'
assert 'countdownScene' not in ids, 'Unwanted cinematic 5-1 scene remains'
assert '280806' not in (p/'config.js').read_text(), 'Demo PIN must not be in config.js'
seatstr=js.split('const SEATS = [',1)[1].split('];',1)[0]
assert len(re.findall(r"'[A-J][1-6]'",seatstr))==40
assert (p/'supabase/schema.sql').exists()
print('STATIC CHECK PASS: 40 seats, references, no 5–1 overlay, SQL present')
