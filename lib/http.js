const express = require('express');
const app = express();
const session = require('express-session');


app.use(express.json());
app.use(express.urlencoded({ extended: true }))

const redisClient = redis.createClient({ host: process.env.REDIS_HOST, port: 6379 });
redisClient.on('error', (err) => {
  console.error('Redis error: ', err);
});

app.use(
  session({
    name: "_sid",
    secret: "fake",
    resave: true,
    saveUninitialized: true,
    store: new redisStore({ client: redisClient, ttl: 86400 })
  })
);
app.use(cookieParser());

app.listen(3000, () => console.log(`Server running on port 3000`));
