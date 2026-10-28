#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
queue_ip="${1:-}"
case "$queue_ip" in *[!0-9.]*|'') echo "Usage: sh scripts/setup-phone-queue-cert.sh YOUR_MAC_WIFI_IP" >&2; exit 1;; esac
if ! printf '%s' "$queue_ip" | awk -F. 'NF==4 {for(i=1;i<=4;i++) if($i !~ /^[0-9]+$/ || $i>255 || $i<0) exit 1;exit 0} {exit 1}'; then echo 'Enter a valid IPv4 address.' >&2; exit 1; fi
if [ -e config/phone-queue/server.key ] || [ -e config/phone-queue-ca/ca.key ]; then
  echo 'Existing phone queue certificate files found. Stopping to avoid overwriting them.' >&2; exit 1
fi
umask 077
mkdir -p config/phone-queue config/phone-queue-ca
cat > config/phone-queue-ca/server-ext.cnf <<END
subjectAltName = IP:$queue_ip
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
END
openssl genrsa -out config/phone-queue-ca/ca.key 3072
cat > config/phone-queue-ca/ca.cnf <<END
[req]
distinguished_name = dn
x509_extensions = ca_extensions
[dn]
[ca_extensions]
basicConstraints = critical,CA:TRUE
keyUsage = critical,keyCertSign,cRLSign
END
openssl req -x509 -new -key config/phone-queue-ca/ca.key -sha256 -days 730 -subj '/CN=Oak Staging Phone Queue Local CA' -config config/phone-queue-ca/ca.cnf -out config/phone-queue-ca/ca.crt
openssl genrsa -out config/phone-queue/server.key 2048
openssl req -new -key config/phone-queue/server.key -subj '/CN=Oak Staging Phone Queue' -out config/phone-queue-ca/server.csr
openssl x509 -req -in config/phone-queue-ca/server.csr -CA config/phone-queue-ca/ca.crt -CAkey config/phone-queue-ca/ca.key -CAcreateserial -out config/phone-queue/server.crt -days 365 -sha256 -extfile config/phone-queue-ca/server-ext.cnf
cp config/phone-queue-ca/ca.crt config/phone-queue/oak-staging-ca.crt
chmod 600 config/phone-queue/server.key config/phone-queue-ca/ca.key
printf '\nCertificate created for https://%s:3443\n' "$queue_ip"
printf '%s\n' 'Transfer only config/phone-queue/oak-staging-ca.crt to your phone. Never transfer the private keys.'
openssl x509 -in config/phone-queue/oak-staging-ca.crt -noout -fingerprint -sha256
