# Resume

Éditeur personnel de CV et de lettres de motivation, hébergé gratuitement sur GitHub Pages.

**Application : https://julodurden.github.io/resume/**

## Fonctionnalités

- **9 modèles** (dont « Sarcelle », reproduisant la mise en page du CV de Julien) (une ou deux colonnes, bandeau, colonne latérale colorée), changeables à tout moment sans perdre le contenu.
- **Sections libres** : profil, expérience, formation, compétences, langues, certifications, projets, réalisations clés, centres d'intérêt, bénévolat, prix, publications, références, texte libre, section personnalisée. Renommer, masquer, dupliquer, réordonner par glisser-déposer, changer de colonne.
- **Personnalisation** : polices (23 Google Fonts + polices système), tailles, interligne, marges, espacements, couleurs et palettes, style des titres, disposition et emplacement de l'en-tête, photo, format des dates, symbole des puces, A4 ou Letter.
- **Aperçu paginé en direct**, identique au PDF. Cliquer sur un bloc de l'aperçu ouvre son édition.
- **Analyse ATS** : collez l'offre, obtenez les mots-clés présents et manquants, un score, et une quinzaine de contrôles (coordonnées, dates, résultats chiffrés, verbes d'action, titres de sections standards, longueur...).
- **Claude** : prompts prêts à l'emploi (adapter le CV à l'offre, rédiger la lettre, réécrire des puces, améliorer le résumé, traduire en anglais, préparer l'entretien). On copie le prompt dans Claude.ai, on recolle la réponse, l'application l'applique. Aucune clé d'API.
- **Import de CV PDF** via Claude : le contenu est converti en sections modifiables.
- **Lettres de motivation** assorties au CV (en-tête et style synchronisés).
- **Exports** : PDF (texte sélectionnable, liens actifs), JSON réimportable, Markdown, texte brut.
- **Annuler / rétablir** (Ctrl+Z / Ctrl+Y), sauvegarde automatique.

## Où sont mes données ?

Uniquement dans le navigateur (IndexedDB), jamais sur un serveur. Conséquences :

- un autre navigateur ou ordinateur ne voit pas vos documents ;
- vider les données du site efface les documents.

Utilisez **Sauvegarder tout** sur l'accueil pour télécharger un fichier JSON, et **Importer** pour le restaurer ailleurs.

## Export PDF

Le bouton **PDF** ouvre l'impression du navigateur. Choisissez « Enregistrer au format PDF », marges « Aucune » si proposé, et cochez « Graphiques d'arrière-plan » pour garder les couleurs. Chrome ou Edge donnent le meilleur résultat.

## Développement

```bash
npm install
npm run dev      # http://localhost:5173/resume/
npm test
npm run build
```

Chaque push sur `main` est testé, construit puis déployé par GitHub Actions (`.github/workflows/deploy.yml`).

Pile : React 19, TypeScript, Vite, Zustand, idb-keyval, dnd-kit, lucide.
