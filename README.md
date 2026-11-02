# Resume

Éditeur de CV et de lettres de motivation, avec suivi des candidatures. Application web sans serveur, hébergée sur GitHub Pages.

**Application et vitrine : https://julodurden.github.io/resume/**

Projet conçu par Julien Clavel avec Claude comme assistant de rédaction.

## Fonctionnalités

**CV**
- 9 modèles (une ou deux colonnes, bandeau, colonne latérale colorée), interchangeables sans perte de contenu.
- 15 types de sections, à renommer, masquer, dupliquer et réordonner par glisser-déposer entre colonnes.
- Personnalisation visuelle : couleurs, polices, tailles, interligne, marges, style des titres, en-tête, photo, intitulés des entrées, affichage des compétences.
- Aperçu paginé en direct, identique au PDF exporté (texte sélectionnable, liens actifs).

**Lettres de motivation**
- 6 modèles, ou le style exact d'un CV pour un dossier homogène.
- Destinataire, date, objet, paragraphes et signature réglables ; signature manuscrite en image (fond rendu transparent automatiquement).

**Offres et candidatures**
- Chaque offre regroupe son CV et sa lettre, avec statut de suivi, notes, contacts et logo de l'entreprise.
- Ajout d'une offre depuis son lien : Claude lit l'annonce et en extrait le poste, l'employeur et le texte complet.

**Veille d'annonces**
- Alertes par métier, lieu, rayon et type de contrat.
- Nouvelles offres récupérées toutes les 3 heures par une tâche GitHub Actions dans le dépôt privé de sauvegarde : API Adzuna (clé gratuite) et, si l'accès est accordé, API France Travail « Offres d'emploi v2 ». Clés stockées en secrets GitHub.
- Tri des annonces : favoris, masquées, création de la candidature en un clic.
- Liens de recherche enregistrés vers LinkedIn, Hellowork, Indeed, APEC et Welcome to the Jungle.

**Fiches métiers**
- Référentiel officiel ROME 4.0 intégré : intitulés équivalents d'un poste (variantes à choisir selon l'offre), définition, compétences, contextes de travail, métiers proches, lien vers MétierScope.

**Analyse ATS**
- Mots-clés de l'offre présents, proches ou absents (racinisation du français), contrôles de lisibilité par les logiciels de recrutement, conseils de rédaction séparés du score.

**Claude**
- Prompts prêts à l'emploi : adapter un CV à une offre, rédiger ou relire une lettre, réécrire des puces, traduire, préparer un entretien, importer un CV PDF. La réponse collée est appliquée automatiquement.

**Données**
- Stockage local dans le navigateur (IndexedDB).
- Sauvegarde automatique optionnelle dans un dépôt GitHub privé (token à accès limité), pour retrouver ses documents sur n'importe quel navigateur.
- Vitrine publique : une sélection de documents visibles par les visiteurs, sans accès aux données privées.
- Exports PDF, JSON, Markdown et texte.

## Sauvegarde GitHub

Accueil > **Sauvegarde GitHub** : créez un dépôt **privé** (ex. `resume-data`), puis un token « fine-grained » limité à ce dépôt avec la permission **Contents : Read and write**. Chaque modification est envoyée en un commit quelques secondes après la saisie. Le token reste dans le navigateur et n'est transmis qu'à l'API GitHub.

## Développement

```bash
npm install
npm run dev      # http://localhost:5173/resume/
npm test
npm run build
```

Chaque push sur `main` est testé, construit puis déployé par GitHub Actions.

Données métiers : France Travail, Répertoire Opérationnel des Métiers et des Emplois (ROME 4.0), Licence Ouverte Etalab. Régénération : `python3 scripts/build_rome.py <dossier RefRomeJson> public/rome`.

Pile : React 19, TypeScript, Vite, Zustand, idb-keyval, dnd-kit, lucide, Vitest.
