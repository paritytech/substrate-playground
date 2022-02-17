openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout tls.key -out tls.crt -subj "/CN=playground-dev.substrate.test"
kubectl create secret tls playground-tls --save-config --key tls.key --cert tls.crt --dry-run=client -o yaml | kubectl apply -f -
