# deploying to staging

The file `../.github/workflow/build-server.yaml` contains all the steps to deploy the updated code to our Kuberenetes Cluster using AWS ECS.

_Docs/Configuration:_ https://github.com/marketplace/actions/kubernetes-action

[kubectl cheatsheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)

```bash
# get logs for running pods
POD_ID=$(kubectl get pods --no-headers=true | awk '{print $1}' | head -n 1)
kubectl logs $POD_ID --all-containers -f

# proxy Vault dashboard (secrets/configs)
kubectl port-forward svc/vault 8200:8200
open "http://127.0.0.1:8200"
# use TOKEN login (see 1Password: Hashicorp Vault)
```

Made changes to `kubernetes/*.yml`? Need to _update environment variable?_

```bash
kubectl apply -f ./kubernetes/deployment.yaml

# debug pod with bash
POD_ID=$(kubectl get pods --no-headers=true | awk '{print $1}' | head -n 1)
kubectl exec --stdin --tty $POD_ID -- /bin/bash

# debug postres in pod
apt-get install postgresql-client-11
psql -d desci-db-staging -U desci-db-staging -W -h desci-db-staging.cluster-ctzyam40vcxa.us-east-2.rds.amazonaws.com

# RUN DB MIGRATION IN POD:
POD_ID=$(kubectl get pods --no-headers=true | awk '{print $1}' | head -n 1)
kubectl exec --stdin --tty $POD_ID -- /bin/bash -c "source /vault/secrets/config ; npx prisma migrate dev --skip-generate"
```

# when making changes to schema.prisma, run the following to migrate

DATABASE_URL=postgresql://walter:white@host.docker.internal:5433/boilerplate npx prisma migrate dev

# THEN

npx prisma generate

# THEN

# you may need to destroy local Docker db container or exec -it DOCKER_ID /bin/bash and run migration

# for visualize Data Model

# generate DBML

npx prisma generate
dbml-renderer -i prisma/dbml/schema.dbml -o prisma/diagram.svg

# generate plantuml

npx prisma-uml ./schema.prisma --server http://localhost:8080

## current cumbersome, yet reliable procedure for migrations or new npm packages in docker container (dev)

- destroy local container (docker ui -> trashcan)
- run yarn docker:dev

## we can fix this by decoupling database from docker config and deploy a shared dev RDS db, leaving the more cumbersome, yet reliable workflow to anyone outside of our org (unfortunately)
