# PING! — Version en ligne

Version V0.33 préparée pour **GitHub + Render**.

## Fonctionnement

- GitHub contient les fichiers du jeu.
- Render récupère automatiquement le dépôt GitHub.
- Render lance `npm install`, puis `npm start`.
- Le serveur Node.js/Socket.IO devient accessible via une URL publique.
- Les deux joueurs ouvrent la même URL.
- J1 crée une partie et obtient un code à 4 chiffres.
- J2 rejoint la partie avec ce code.
- Le mode BOT reste disponible.

## Déploiement sur GitHub

1. Créer un nouveau dépôt GitHub, par exemple `ping-online`.
2. Décompresser ce dossier.
3. Envoyer **le contenu du dossier** dans le dépôt GitHub :
   - `index.html`
   - `server.js`
   - `package.json`
   - `render.yaml`
   - `fond_ping_aquarelle.png`
   - `.gitignore`
   - les autres fichiers fournis
4. Vérifier que `package.json` et `server.js` sont bien à la racine du dépôt.

## Déploiement sur Render

1. Ouvrir Render.
2. Créer un nouveau **Web Service**.
3. Connecter le compte GitHub.
4. Sélectionner le dépôt `ping-online`.
5. Si Render détecte `render.yaml`, utiliser la configuration proposée.
6. Sinon renseigner :
   - Runtime : `Node`
   - Build Command : `npm install`
   - Start Command : `npm start`
7. Déployer.

Render fournit ensuite une URL publique du type :

`https://ping-online-xxxx.onrender.com`

## Premier test Internet

Sur le premier appareil :
1. ouvrir l'URL Render ;
2. entrer le prénom ;
3. cliquer sur **Jouer contre un joueur** ;
4. noter le code de salle.

Sur le second appareil, idéalement sur un autre réseau :
1. ouvrir la même URL Render ;
2. entrer le prénom ;
3. choisir **Rejoindre une partie** ;
4. saisir le code de salle.

## Important

Les salles sont actuellement stockées en mémoire du serveur.
Si Render redémarre le service, une partie en cours sera perdue.

Ce n'est pas bloquant pour les premiers tests Internet.
Les prochaines étapes de robustesse seront :
- reconnexion automatique ;
- reprise de partie après une coupure ;
- nettoyage des salles inactives ;
- éventuellement stockage persistant.

## Version de référence

La V0.31 reste la référence esthétique/fonctionnelle locale.
La V0.33 reprend cette base avec la préparation GitHub + Render.
