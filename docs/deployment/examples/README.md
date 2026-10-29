# VPS deployment reference templates

These files record the existing service topology with environment values
removed. They are documentation templates, not automatic restore files.

- Supply private environment values on the VPS.
- Review command/entrypoint placeholders against the private originals.
- Relative paths must be interpreted from each original project directory.
- The Caddyfile is reconstructed, not copied from the live configuration.
- Verify Caddy upstream names, network aliases and route ordering.
- Preserve private VPN subscription configuration separately.
- Review remaining scalar values for credentials before committing.
- Do not run these examples against live services without adaptation.
- Do not commit the actual runtime environment file or VPN profiles.

Original project directories:
- Expenses: /opt/oak-expense
- Gateway: /opt/oak-gateway
- WireGuard: /opt/oak-vpn
- OpenVPN: /opt/oak-openvpn

Database data, uploads, certificates, private keys and installed scheduler
state require separate private backups. They are not included here.
