docker exec -it -u 0 desci_nodes_backend /bin/chown -R node node_modules
docker exec -it -u 0 desci_nodes_backend /bin/chown -R node /app/node_modules/.prisma
docker exec -it -u 0 db_boilerplate /bin/chown -R postgres /var/lib/postgresql

(docker ps -a | awk '{print $1}' | xargs docker stop )

./dockerDev.sh
