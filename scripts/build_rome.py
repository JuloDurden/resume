"""
Construit les données ROME utilisées par Resume (intitulés équivalents et fiches métiers).

Source : France Travail, Répertoire Opérationnel des Métiers et des Emplois (ROME 4.0),
Licence Ouverte / Open Licence Etalab.
https://www.data.gouv.fr/datasets/repertoire-operationnel-des-metiers-et-des-emplois-rome/

Usage : python3 scripts/build_rome.py <dossier contenant les unix_*.json> public/rome
"""
import json
import os
import re
import sys

src, out = sys.argv[1], sys.argv[2]


def load(prefix):
    name = next(f for f in os.listdir(src) if f.startswith(prefix) and f.endswith('.json'))
    raw = open(os.path.join(src, name), 'rb').read()
    try:
        return json.loads(raw.decode('utf-8'))
    except UnicodeDecodeError:
        return json.loads(raw.decode('iso8859_15'))  # fichiers publiés en ISO-8859-15 (œ, €)


version = 'ROME 4.0'
vfile = os.path.join(src, 'version.txt')
if os.path.exists(vfile):
    txt = open(vfile, 'rb').read().decode('iso8859_15', 'replace')
    m = re.search(r'Titre/commentaire : (.+)', txt)
    if m:
        version = m.group(1).strip()

fiches = load('unix_fiche_emploi_metier')
appellations = load('unix_referentiel_appellation')

os.makedirs(os.path.join(out, 'fiches'), exist_ok=True)
metiers = {}
for f in fiches:
    code = f['rome']['code_rome']
    metiers[code] = f['rome']['intitule']
    c = f.get('competences') or {}

    def enjeux(block, key='enjeux'):
        return [
            {'g': e['libelle'], 'items': [{'l': i['libelle'], 'c': 1 if i.get('coeur_metier') == 'Principale' else 0} for i in e.get('items', [])]}
            for e in (block or {}).get(key, [])
        ]

    data = {
        'code': code,
        'intitule': f['rome']['intitule'],
        'appellations': sorted({a['libelle_court'] for a in f.get('appellations', [])}),
        'definition': (f.get('definition') or '').strip(),
        'acces': (f.get('acces_metier') or '').strip(),
        'savoirFaire': enjeux(c.get('savoir_faire')),
        'savoirEtre': [i['libelle'] for e in (c.get('savoir_etre_professionnel') or {}).get('enjeux', []) for i in e.get('items', [])],
        'savoirs': enjeux(c.get('savoirs'), 'categories'),
        'contextes': [{'g': x['libelle'], 'items': [i['libelle'] for i in x.get('items', [])]} for x in f.get('contextes_travail') or []],
        'secteurs': [s['libelle'] for s in f.get('secteurs_activite') or []],
        'mobilites': [
            {'code': m['rome_cible'].split(' - ', 1)[0].strip(), 'intitule': m['rome_cible'].split(' - ', 1)[-1].strip()}
            for m in sorted(f.get('mobilites') or [], key=lambda m: m.get('ordre_mobilite') or 99)
        ][:12],
    }
    with open(os.path.join(out, 'fiches', code + '.json'), 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(',', ':'))

apps = sorted({(a['libelle_court'], a['code_rome_parent']) for a in appellations if a.get('code_rome_parent') in metiers and a.get('peu_usite') != 'O'})
index = {'version': version, 'metiers': metiers, 'appellations': [list(x) for x in apps]}
with open(os.path.join(out, 'index.json'), 'w', encoding='utf-8') as fh:
    json.dump(index, fh, ensure_ascii=False, separators=(',', ':'))
print(version, len(metiers), 'métiers,', len(apps), 'appellations')
