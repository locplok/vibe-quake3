# 🚀 Déploiement Rapide - Vibe Quake3

## Étape 1 : Déployer le serveur sur Render

1. **Aller sur** : https://render.com et créer un compte
2. **Nouveau Web Service** :
   - Connecter le repo GitHub `vibe-quake3-server`
   - **Name** : `vibe-quake3-server`
   - **Start Command** : `npm start`
   - **Plan** : Free
3. **Déployer** et **noter l'URL** (ex: `https://vibe-quake3-server.onrender.com`)

## Étape 2 : Déployer le client sur Vercel

1. **Aller sur** : https://vercel.com et créer un compte
2. **Importer le projet** :
   - Connecter le repo GitHub `vibe-quake3`
   - Vercel détectera automatiquement Vite
3. **Variables d'environnement** (optionnel) :
   - `VITE_SERVER_URL` = URL de votre serveur Render
   - (Ou laisser vide, le code utilise déjà l'URL Render par défaut)
4. **Déployer**

## Étape 3 : Mettre à jour les CORS

1. Dans `vibe-quake3-server/index.js`, ligne 15, ajouter votre URL Vercel :
```javascript
origin: ["https://votre-app.vercel.app", "http://localhost:5173"],
```
2. **Redéployer le serveur** sur Render

## ✅ C'est tout !

Votre jeu est maintenant en ligne ! 🎮

Pour plus de détails, voir `DEPLOY.md`

