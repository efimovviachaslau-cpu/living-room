"""Компактное форматирование layout.json: объект в одну строку, если влезает в 150 символов.
Использование из своих скриптов: from fmt_json import dump; dump(obj, path)."""
import json


def fmt(v, ind=0, key_len=0):
    s = json.dumps(v, ensure_ascii=False)
    if not isinstance(v, (dict, list)) or len(s) + ind + key_len <= 150:
        if isinstance(v, dict) and v:
            return '{ ' + ', '.join(f'{json.dumps(k, ensure_ascii=False)}: {json.dumps(x, ensure_ascii=False)}' for k, x in v.items()) + ' }'
        return s
    pad = ' ' * (ind + 2)
    if isinstance(v, dict):
        items = [f'{pad}{json.dumps(k, ensure_ascii=False)}: {fmt(x, ind + 2, len(k) + 4)}' for k, x in v.items()]
        return '{\n' + ',\n'.join(items) + '\n' + ' ' * ind + '}'
    return '[\n' + ',\n'.join(pad + fmt(x, ind + 2) for x in v) + '\n' + ' ' * ind + ']'


def dump(obj, path):
    open(path, 'w').write(fmt(obj) + '\n')
