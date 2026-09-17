# Déploiement Vertrag.ma — Oracle Cloud VM

Ce document décrit la configuration qui maintient l'application **toujours ON** et **accessible publiquement** sur `http://130.110.240.95:4000`.

---

## Architecture

```
Boot VM (Ubuntu 24.04 aarch64)
  └─ netfilter-persistent.service (charge /etc/iptables/rules.v4)
       └─ vertrag-iptables.service (oneshot : ouvre port 4000)
            └─ vertrag.service (PM2 → node server.js sur port 4000)
```

### Services systemd

| Service | Rôle | Utilisateur |
|---------|------|-------------|
| `vertrag-iptables.service` | Règle iptables pour port 4000 | root (ExecStartPre) |
| `vertrag.service` | Lance l'app standalone via PM2 | ubuntu |

### Fichiers clés

| Fichier | Rôle |
|---------|------|
| `/usr/local/bin/vertrag-start.sh` | Script de démarrage (PM2 + surveillance) |
| `/etc/systemd/system/vertrag.service` | Service systemd app |
| `/etc/systemd/system/vertrag-iptables.service` | Service systemd iptables |
| `/etc/iptables/rules.v4` | Règles iptables persistantes |

---

## Après des changements dans le code

Quand tu modifies le code source de l'application, il faut rebuild et restart :

```bash
cd ~/github/other-repos/webapp--vertrag-ma
bun run build && cp .env .next/standalone/.env
sudo systemctl restart vertrag.service
```

### Vérifier que tout marche

```bash
sudo systemctl status vertrag.service --no-pager
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/
curl -s -o /dev/null -w "%{http_code}" http://130.110.240.95:4000/
```

Les deux doivent retourner `200`.

---

## Commandes utiles

```bash
# Voir les logs PM2
pm2 logs vertrag-ma

# Voir les logs systemd
journalctl -u vertrag.service --no-pager -n 20

# Restart manuel
sudo systemctl restart vertrag.service

# Vérifier les services enabled
sudo systemctl is-enabled vertrag-iptables.service vertrag.service

# Vérifier les règles iptables
sudo iptables -L INPUT -n --line-numbers
```

---

## Points importants

- **Jamais `pm2 kill` ni `pm2 stop all`** — tue les autres apps sur la VM
- **L'URL publique est dans `NEXT_PUBLIC_APP_URL`** — les liens d'email pointent vers cette URL
- **Les cookies sont en `secure: false`** via `ALLOW_HTTP_COOKIES=true` — car pas de HTTPS
- **Le rate limit est désactivé** via `DISABLE_RATE_LIMIT=test` — le réactiver en production si besoin
