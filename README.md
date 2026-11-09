# Site web hoona

Sources du site [hoona.life](https://www.hoona.life), centre holistique de vitalité à Tervuren.

Le site est statique. Il est produit par un petit générateur Python, sans dépendance, à partir de gabarits HTML et de contenus en JSON et en Markdown.

## Organisation

| Dossier | Contenu |
|---|---|
| `src/` | Gabarit commun, pages par langue (`fr`, `nl`, `en`), textes d'interface |
| `content/` | Catalogues des soins et des sessions, journées, séjours, chemins, témoignages, articles du Journal |
| `assets/` | Feuilles de style, scripts, images, vidéos, polices |
| `admin/` | Configuration de l'éditeur de contenus |
| `build.py` | Le générateur |

## Construire le site

```bash
python3 build.py
```

Le générateur écrit les pages dans `fr/`, `nl/` et `en/`, puis rassemble ce qui part en ligne dans `dist/`. Ces dossiers ne sont pas versionnés.

Pour reconstruire à chaque modification :

```bash
python3 build.py --watch
```

## Mise en ligne

Netlify construit le site avec la commande ci-dessus et publie `dist/` (voir `netlify.toml`).

Le fichier `_headers` demande aux moteurs de recherche de ne pas indexer la préproduction. Il est à supprimer le jour où le domaine hoona.life pointe sur ce site.

## Droits

Les textes, les images, les vidéos et la marque hoona sont la propriété de Hoona SRL. Tous droits réservés.
