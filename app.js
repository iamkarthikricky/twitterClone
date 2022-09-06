const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const databasePath = path.join(__dirname, "twitterClone.db");

const app = express();

app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server Running at http://localhost:3000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const listOfLikedUsername = (query) => {
  let empty = [];
  query.forEach((element) => {
    empty.push(Object.values(element));
  });
  let arrLength = empty.length;
  let arr1 = empty.flat(arrLength);
  return {
    likes: arr1,
  };
};

const listOfReplies = (query) => {
  let empty = [];
  query.forEach((element) => {
    empty.push(element);
  });
  return { replies: empty };
};

//API 1
app.post("/register", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const UserExistQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const isUserExists = await database.get(UserExistQuery);

  if (isUserExists !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    const isPasswordLength = password.length;
    if (isPasswordLength < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const newUserQuery = `INSERT INTO 
                user (name, username, password, gender) VALUES
                ('${name}', '${username}', '${hashedPassword}', '${gender}')`;
      const dbResponse = await database.run(newUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const UserExistQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const isUserExists = await database.get(UserExistQuery);
  if (isUserExists === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      isUserExists.password
    );
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;

  const tweetFeedQuery = `SELECT user.username,tweet,tweet.date_time as dateTime  FROM user INNER JOIN tweet ON tweet.user_id = user.user_id WHERE tweet.user_id IN (SELECT user.user_id FROM user 
    INNER JOIN follower ON follower.following_user_id = user.user_id 
    WHERE follower_user_id IN (SELECT user_id FROM user WHERE username = '${username}')) GROUP BY tweet.tweet_id ORDER BY dateTime desc LIMIT 4`;
  const resultQuery = await database.all(tweetFeedQuery);
  response.send(resultQuery);
});

//API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  const userQuery = `
    SELECT name FROM user 
    INNER JOIN follower ON follower.following_user_id = user.user_id 
    WHERE follower_user_id IN (SELECT user_id FROM user WHERE username = '${username}')
    `;
  const resultArray = await database.all(userQuery);
  response.send(resultArray);
});

//API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  const userQuery = `
    SELECT name FROM user 
    INNER JOIN follower ON follower.follower_user_id = user.user_id 
    WHERE following_user_id IN (SELECT user_id FROM user WHERE username = '${username}')
    `;
  const resultArray = await database.all(userQuery);
  response.send(resultArray);
});

//API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  let { username } = request;
  let { tweetId } = request.params;

  const userQuery = `SELECT tweet FROM tweet WHERE tweet_id= ${tweetId} AND user_id IN (SELECT user_id FROM user 
    INNER JOIN follower ON follower.following_user_id = user.user_id 
    WHERE follower_user_id IN (SELECT user_id FROM user WHERE username = '${username}'))`;
  const resultArray = await database.get(userQuery);
  if (resultArray === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const tweetQuery = `SELECT tweet,COUNT(like.like_id) as likes,count(reply.reply_id) as replies,tweet.date_time as dateTime FROM like INNER JOIN reply ON reply.tweet_id = like.tweet_id INNER JOIN tweet ON like.tweet_id = tweet.tweet_id WHERE tweet.tweet_id = ${tweetId} GROUP BY like.like_id;`;
    const tweetQueryArray = await database.get(tweetQuery);
    response.send(tweetQueryArray);
  }
});

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    let { tweetId } = request.params;

    const userQuery = `SELECT tweet FROM tweet WHERE tweet_id= ${tweetId} AND user_id IN (SELECT user_id FROM user 
    INNER JOIN follower ON follower.following_user_id = user.user_id 
    WHERE follower_user_id IN (SELECT user_id FROM user WHERE username = '${username}'))`;
    const resultArray = await database.get(userQuery);
    if (resultArray === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const likeUserQuery = `SELECT user.username FROM user INNER JOIN like ON like.user_id = user.user_id WHERE tweet_id = ${tweetId}`;
      const resultQuery = await database.all(likeUserQuery);
      response.send(listOfLikedUsername(resultQuery));
    }
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    let { tweetId } = request.params;

    const userQuery = `SELECT tweet FROM tweet WHERE tweet_id= ${tweetId} AND user_id IN (SELECT user_id FROM user 
    INNER JOIN follower ON follower.following_user_id = user.user_id 
    WHERE follower_user_id IN (SELECT user_id FROM user WHERE username = '${username}'))`;
    const resultArray = await database.get(userQuery);
    if (resultArray === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const likeUserQuery = `SELECT user.name,reply FROM user INNER JOIN reply ON reply.user_id = user.user_id WHERE tweet_id = ${tweetId}`;
      const resultQuery = await database.all(likeUserQuery);
      response.send(listOfReplies(resultQuery));
    }
  }
);

//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const userTweets = `SELECT tweet,COUNT(DISTINCT like_id) as likes,COUNT(DISTINCT reply_id) as replies,tweet.date_time as dateTime FROM tweet INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
    WHERE tweet.user_id IN (SELECT user_id FROM user WHERE username= '${username}') GROUP BY tweet.tweet_id`;
  const responseResults = await database.all(userTweets);
  response.send(responseResults);
});
//API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const addTweetQuery = `INSERT INTO tweet(tweet) VALUES('${tweet}')`;
  const tweetSuccess = await database.run(addTweetQuery);
  response.send("Created a Tweet");
});
//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const userQuery = `SELECT tweet FROM tweet INNER JOIN user ON user.user_id = tweet.user_id WHERE username='${username}' AND tweet.tweet_id =${tweetId}`;
    const resultArray = await database.get(userQuery);
    if (resultArray === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteQuery = `DELETE FROM tweet WHERE tweet_id =${tweetId};`;
      await database.run(deleteQuery);
      response.send("Tweet Removed");
    }
  }
);
module.exports = app;
