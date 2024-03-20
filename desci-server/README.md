## Testing

Run integration tests

```
# this spins up docker environment for isolated tests (test db, test redis, test ipfs, etc)
yarn test
```

Testing a subset of tests
modify `desci-server/package.json`

```
# edit the *.test.ts to specify the glob of tests to run then run yarn tets
"test:destructive": "NODE_PATH=./src mocha --colors --require ts-node/register 'test/integration/**/*.test.ts' --timeout 20000 --exit",
## TODO: make this easier to do without requiring package.json update of which reverting can be forgotton accidentally
## maybe make a tmp file that is gitignored, if overwritten the specified tests are run
```

# RUNNING MIGRATIONS: when making changes to schema.prisma, run the following to migrate

DATABASE_URL=postgresql://walter:white@localhost:5433/boilerplate npx prisma migrate dev

# THEN

npx prisma generate

# THEN

# you may need to destroy local Docker db container or exec -it DOCKER_ID /bin/bash and run migration

# Deploying to production

The file `../.github/workflow/build-server.yaml` contains all the steps to deploy the updated code to a Kubernetes cluster
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
kubectl apply -f ./kubernetes/deployment_production.yaml

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

# for visualizing Data Model

# generate DBML

npx prisma generate
npm i -g @softwaretechnik/dbml-renderer
npx dbml-renderer prisma/dbml/schema.dbml -o prisma/diagram.svg

# generate plantuml

npx prisma-uml ./schema.prisma --server http://localhost:8080

## current cumbersome, yet reliable procedure for migrations or new npm packages in docker container (dev)

- destroy local container (docker ui -> trashcan)
- run yarn docker:dev

## we can fix this by decoupling database from docker config and deploy a shared dev RDS db, leaving the more cumbersome, yet reliable workflow to anyone outside of our org (unfortunately)
