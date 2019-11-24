db.createUser({
    user: "root",
    pwd: "example",
    roles: [ { role: "readWrite", db: "properties" } ]
});

db.users.insert({
    name: "root"
});