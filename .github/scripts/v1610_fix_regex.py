from pathlib import Path

for test_file in Path('tests').glob('*.test.js'):
    source = test_file.read_text()
    updated = source.replace(r'1\.6\.9', r'1\.6\.10')
    if updated != source:
        test_file.write_text(updated)
