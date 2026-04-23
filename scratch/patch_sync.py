import os

base_dir = os.path.dirname(os.path.abspath(__file__))
target = os.path.join(base_dir, '..', 'js', 'delivery-calendar.js')

with open(target, 'r', encoding='utf-8') as f:
    content = f.read()

# TRAVIS JOSEY cleaned name = "TRAVISJOSEY"
# Email prefix tjizzle88@yahoo.com -> "TJIZZLE88"

old_group = '["GREGORYCUTINO", "GRIGORY2013"]'
new_group = '["GREGORYCUTINO", "GRIGORY2013"],\n            ["TRAVISJOSEY", "TJIZZLE88"]'

count = content.count(old_group)
print(f'Found {count} occurrence(s) of the target group')

content = content.replace(old_group, new_group)

with open(target, 'w', encoding='utf-8') as f:
    f.write(content)

# Verify
import re
matches = [(m.start(), content[max(0,m.start()-20):m.start()+60]) for m in re.finditer('TRAVISJOSEY', content)]
print(f'TRAVISJOSEY now appears {len(matches)} time(s):')
for idx, snippet in matches:
    print(f'  pos {idx}: {repr(snippet)}')
print('Done.')
