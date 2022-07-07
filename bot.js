require("dotenv").config();
const { default: axios } = require("axios");
const twit = require("./twit");
const fs = require("fs");
const path = require("path");
const paramsPath = path.join(__dirname, "params.json");

function writeParams(data) {
  console.log("We are writing the params file ...", data);
  return fs.writeFileSync(paramsPath, JSON.stringify(data));
}

function readParams() {
  console.log("We are reading the params file ...");
  const data = fs.readFileSync(paramsPath);
  return JSON.parse(data.toString());
}

function getTweets(since_id) {
  return new Promise((resolve, reject) => {
    let params = {
      q: "@GaurangBhardwa1",
      result_type: "mixed",
      count: 10,
    };
    if (since_id) {
      params.since_id = since_id;
    }
    console.log("We are getting the tweets ...", params);
    twit.get("search/tweets", params, (err, data) => {
      if (err) {
        return reject(err);
      }
      return resolve(data);
    });
  });
}

function postRetweet(id) {
  return new Promise((resolve, reject) => {
    let params = {
      id,
    };
    twit.post("statuses/retweet/:id", params, (err, data) => {
      if (err) {
        return reject(err);
      }
      return resolve(data);
    });
  });
}

async function downloadImage(url, filepath) {
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });
  return new Promise((resolve, reject) => {
    response.data
      .pipe(fs.createWriteStream(filepath))
      .on("error", reject)
      .once("close", () => resolve(filepath));
  });
}

// Unsplash API
async function getImage(searchTerm) {
  try {
    const res = await axios.get(
      `https://api.unsplash.com/search/photos?query=${searchTerm}`,
      {
        headers: {
          Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`,
        },
      }
    );
    const selectRandomImage =
      res.data.results[Math.floor(Math.random() * res.data.results.length) - 1];
    const imagePath = `./media/${searchTerm}-${Date.now()}.jpg`;
    await downloadImage(selectRandomImage?.links.download, imagePath);

    const image = {
      success: true,
      path: imagePath,
      altText: selectRandomImage.alt_description || searchTerm,
      description: selectRandomImage.description || searchTerm,
    };

    return image;
  } catch (error) {
    console.error("Error: ", error.message);
  }
}

function replyToTweet(id, image) {
  return new Promise((resolve, reject) => {
    var b64content = fs.readFileSync(image.path, {
      encoding: "base64",
    });

    twit.post("media/upload", { media_data: b64content }, function (err, data) {
      if (err) {
        return reject(err);
      }
      var mediaIdStr = data.media_id_string;
      var altText = image.altText;
      var meta_params = { media_id: mediaIdStr, alt_text: { text: altText } };

      twit.post("media/metadata/create", meta_params, function (err, data) {
        if (err) {
          return reject(err);
        }
        var params = {
          in_reply_to_status_id: id,
          auto_populate_reply_metadata: true,
          status: image.description,
          media_ids: [mediaIdStr],
        };

        twit.post("statuses/update", params, function (err, data) {
          if (err) {
            return reject(err);
          }
          return resolve(data);
        });
      });
    });
  });
}

var stream = twit.stream("statuses/filter", {
  track: "@gaurangbot find image",
});

stream.on("tweet", async function (tweet) {
  const image = tweet.text.split("find image")[1].trim();
  const imageResponse = await getImage(image);
  if (imageResponse?.success) {
    await replyToTweet(tweet.id_str, imageResponse);
    console.log("Successful reply " + tweet.id_str);
  }
  fs.unlink(imageResponse.path, function (err) {
    if (err) return console.log(err);
    console.log("file deleted successfully");
  });
});

async function main() {
  try {
    const params = readParams();
    const data = await getTweets(params.since_id);
    const tweets = data.statuses;
    console.log("We got the tweets", tweets.length);
    for await (let tweet of tweets) {
      try {
        await postRetweet(tweet.id_str);
        console.log("Successful retweet " + tweet.id_str);
      } catch (e) {
        console.log("Unsuccessful retweet " + tweet.id_str);
      }
      params.since_id = tweet.id_str;
    }
    writeParams(params);
  } catch (e) {
    console.error(e);
  }
}

console.log("Starting the twitter bot ...");

setInterval(main, 10000);
