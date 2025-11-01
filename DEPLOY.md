# Guide de déploiement - Vibe Quake3

Ce guide vous explique comment déployer le jeu Vibe Quake3 sur internet.

## Architecture

Le projet est divisé en deux parties :
- **Client (Frontend)** : Application web React/Three.js déployée sur Vercel
- **Serveur (Backend)** : Serveur Node.js avec Socket.IO déployé sur Render

## Prérequis

- Un compte GitHub
- Un compte Vercel (gratuit) : https://vercel.com
- Un compte Render (gratuit) : https://render.com

## Déploiement du serveur (Backend)

### Option 1 : Render (Recommandé)

1. **Aller sur Render** : https://render.com
2. **Créer un nouveau service** :
   - Cliquer sur "New +" → "Web Service"
   - Connecter votre repository GitHub avec le dossier `vibe-quake3-server`
3. **Configurer le service** :
   - **Name** : `vibe-quake3-server`
   - **Environment** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Plan** : Free (gratuit)
4. **Variables d'environnement** (optionnel) :
   - `PORT` : Laissé vide (Render utilise automatiquement le port défini)
5. **Déployer** : Cliquer sur "Create Web Service"
6. **Noter l'URL** : Une fois déployé, vous obtiendrez une URL comme `https://vibe-quake3-server.onrender.com`

### Option 2 : Railway

1. Aller sur https://railway.app
2. Créer un nouveau projet
3. Connecter le repository `vibe-quake3-server`
4. Railway détectera automatiquement Node.js
5. Déployer et noter l'URL

### Option 3 : Heroku

1. Installer Heroku CLI
2. Dans le dossier `vibe-quake3-server` :
```bash
heroku create vibe-quake3-server
git push heroku main
```

## Déploiement du client (Frontend)

### Vercel (Recommandé)

1. **Aller sur Vercel** : https://vercel.com
2. **Importer le projet** :
   - Cliquer sur "New Project"
   - Connecter votre repository GitHub avec le dossier `vibe-quake3`
   - Sélectionner le projet
3. **Configuration** :
   - **Framework Preset** : Vite (détecté automatiquement)
   - **Build Command** : `npm run build` (déjà configuré)
   - **Output Directory** : `dist` (déjà configuré)
4. **Variables d'environnement** :
   - `VITE_SERVER_URL` : Mettre l'URL de votre serveur (ex: `https://vibe-quake3-server.onrender.com`)
   - Si vous utilisez Render, cette variable est optionnelle car le code utilise déjà cette URL par défaut
5. **Déployer** : Cliquer sur "Deploy"

## Mise à jour des CORS du serveur

Après avoir déployé le client, vous devez mettre à jour l'URL dans les CORS du serveur :

1. Aller dans votre serveur déployé (Render/Railway/etc.)
2. Trouver le fichier `index.js` dans `vibe-quake3-server`
3. Mettre à jour la ligne 15 avec l'URL de votre client Vercel :
```javascript
origin: ["https://votre-app.vercel.app", "http://localhost:5173"],
```
4. Redéployer le serveur

## Vérification

Une fois les deux déploiements terminés :

1. **Testez le client** : Ouvrez l'URL Vercel dans votre navigateur
2. **Vérifiez la connexion** : Le jeu devrait se connecter automatiquement au serveur
3. **Testez en multi-joueur** : Ouvrez plusieurs onglets pour tester le multi-joueur

## URLs de production

- **Client** : `https://votre-app.vercel.app`
- **Serveur** : `https://vibe-quake3-server.onrender.com` (ou votre URL Render)

## Mises à jour

Pour mettre à jour le jeu :

1. **Client** : Push sur GitHub, Vercel redéploie automatiquement
2. **Serveur** : Push sur GitHub, puis redéployez manuellement sur Render (ou configurez auto-deploy)

## Troubleshooting

### Le client ne se connecte pas au serveur

- Vérifiez que l'URL du serveur dans `src/network.js` est correcte
- Vérifiez les CORS du serveur incluent l'URL de votre client Vercel
- Vérifiez que le serveur est bien en ligne

### Erreurs de build sur Vercel

- Vérifiez que toutes les dépendances sont dans `package.json`
- Vérifiez que le build command est correct : `npm run build`

### Le serveur ne démarre pas

- Vérifiez que le port est bien configuré (Render utilise `process.env.PORT`)
- Vérifiez les logs dans la console Render pour voir les erreurs

## Support

Pour plus d'aide, consultez la documentation :
- Vercel : https://vercel.com/docs
- Render : https://render.com/docs

