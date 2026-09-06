# PING! — V0.34 en ligne

Cette version réunit dans un seul paquet :

- jeu **Joueur contre Joueur** via Internet ;
- **BOT facile** (algorithme initial conservé) ;
- **BOT intermédiaire V2** ;
- journal CSV enrichi pour analyser les décisions du BOT ;
- configuration **GitHub + Render**.

## Mise à jour de ton dépôt GitHub existant

Décompresse ce ZIP puis dépose **le contenu du dossier** `PING_V0_34_GITHUB_RENDER_BOTS`
à la racine de ton dépôt GitHub `ping`.

Les fichiers importants doivent être directement à la racine :

- `index.html`
- `server.js`
- `package.json`
- `render.yaml`
- `fond_ping_aquarelle.png`

Tu peux remplacer les anciennes versions de ces fichiers.

Après le commit, si ton service Render est déjà relié au dépôt et que l'auto-déploiement
est actif, Render redéploiera automatiquement la V0.34.

## Configuration Render

- Runtime : Node
- Build Command : `npm install`
- Start Command : `npm start`
- Health Check Path : `/health`

Le serveur utilise automatiquement la variable `PORT` fournie par Render.

## Modes disponibles

### Joueur contre Joueur
Même fonctionnement réseau que la version Internet précédente :
J1 crée une salle, partage le code, J2 rejoint depuis la même URL publique.

### BOT facile
Conserve le comportement du BOT initial.

### BOT intermédiaire V2
Ajoute :
- meilleure gestion déplacement / énergie ;
- marge de survie au prochain échange ;
- pression sur les ressources adverses ;
- défense renforcée de l'objectif adverse visible ;
- anticipation simple à un échange.

### Journal CSV
Le journal enrichi reste disponible pour les parties contre BOT afin de comparer
le coup joué aux autres choix légalement disponibles.

## Important

Les salles restent stockées en mémoire du serveur.
Un redémarrage du service Render interrompt donc les parties en cours.
