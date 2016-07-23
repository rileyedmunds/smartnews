var HTTPS = require('https');
var indico = require('indico.io');
var async = require('async');
var webhose = require('webhose-nodejs');

function maxOfDictionary(obj) {
/* [Gathers key with max value]:
  IN: dictionary,
  OUT: key associated with maximum value */
  var maxVal = 0;
  var maxIndex, maxKey;
  for (var key in obj) {
    if (obj[key] > maxVal) {
      maxVal = obj[key];
      maxKey = key;
    }
  }

  return maxKey;
}

function gettop10(obj) {
/* [Extract data from WebHose request]:
  IN: news data (JSON),
  OUT: array of tuples containing title and url */
  var output = [];
  for (var i=0; i<=2; i++) {
    output[i] = [obj.posts[i].title, obj.posts[i].thread.url];
  }
  return output;
}

function indicoAnalysis(input, imageurl, callback) {
 /* [Indico API Async call]:
    IN: message text and image url,
    FUNCTION: gathers and extracts indico analysis data */
  var textargsmax, sentimentHQ, peoplemax, placesmax, organizationsmax, imageFeatures;

  /* log responses from Indico calls*/
  var responseSentiment = function(res) { sentimentHQ = res;}
  var logErrorSentiment = function(err) { console.log(err); }

  var responseTextTags = function(res) { textargsmax = maxOfDictionary(res);}
  var logErrorTextTags = function(err) { console.log(err); }

  var responsePeople = function(res) { peoplemax = maxOfDictionary(res);}
  var logErrorPeople = function(err) { console.log(err); }

  var responsePlaces = function(res) { placesmax = maxOfDictionary(res);}
  var logErrorPlaces = function(err) { console.log(err); }

  /* two ways the news callback can be invoked: 
    case 1: NO IMAGE
    case 2: IMAGE */
  /* 1: callback once the whole Indico call stack completes (NO IMAGE)*/
  var responseOrganizations = function(res) {
    organizationsmax = maxOfDictionary(res);
    if (imageurl == undefined) { //callback only if there is no image to process
      webhoseScrape(textargsmax, peoplemax, placesmax, organizationsmax); //Invoke the news API based on Indico analysis of your message (NO IMAGE)
    }
  }
  var logErrorOrganizations = function(err) { console.log(err); }

  /* 2: callback once the whole Indico call stack completes (IMAGE) */
  var responseImage = function(res) { 
    imageFeatures = res; 
    console.log("ANALYZED IMAGE!\n");
    //invoke the news API based on Indico analysis of the request message
    if (imageurl != undefined) {
      console.log("callback image");
      webhoseScrape(textargsmax, peoplemax, placesmax, organizationsmax, imageFeatures); //Invoke the news API based on Indico analysis of your message (IMAGE)
    }
  }
  var logErrorImage = function(err) { console.log(err); }

  /* Send calls to Indico */
  /* sentiment analysis */
  indico.sentimentHQ(input)
    .then(responseSentiment)
    .catch(logErrorSentiment);

  /* subject (textargs) */
  indico.textTags(input)
    .then(responseTextTags)
    .catch(logErrorTextTags);

  /* political leaning */
  indico.people(input)
    .then(responsePeople)
    .catch(logErrorPeople);

  /* briggs persona */
  indico.places(input)
    .then(responsePlaces)
    .catch(logErrorPlaces);

  /* emotion */
  indico.organizations(input)
    .then(responseOrganizations)
    .catch(logErrorOrganizations);

  /* image recognition */
  if (imageurl != undefined) {
      indico.image_recognition(imageurl)
    .then(responseImage)
    .catch(logErrorImage);
  }
}

function postMessage(webhosedata) {
/* [Format and send HTTP Response]:
  IN: clean news data,
  FUNCTION: format, print, and send response to send GroupMe message */

  /*Parse and Clean Data */
  var jsonwebhose = JSON.parse(webhosedata);
  top10 = gettop10(jsonwebhose);  

  /* set up the response call */
  var botResponse, options, body, botReq, response;
  options = {
    hostname: 'api.groupme.com',
    path: '/v3/bots/post',
    method: 'POST'
  };

  /* format message
    case 1: respond to message with IMAGE
    case 2: respond to message with NO IMAGE */
  if (attachment != undefined) { 
    response = 'News related to your image and query: \n\n' + 
                '1) ' + top10[0][0] + ': ' + top10[0][1] + ' \n' +
                '2) ' +top10[1][0] + ': ' + top10[1][1] + ' \n' +
                '3) ' +top10[2][0] + ': ' + top10[2][1];
  } else { 
    response = 'News related to your query: \n\n' + 
                '1) ' +top10[0][0] + ': ' + top10[0][1] + ' \n' +
                '2) ' +top10[1][0] + ': ' + top10[1][1] + ' \n' +
                '3) ' +top10[2][0] + ': ' + top10[2][1];// + '). \n'
  }

  //bind message contents
  body = {
    "bot_id" : BOT_ID, //defined within Heroku
    "text" :  response
  };

  console.log(response);

  botReq = HTTPS.request(options, function(res) {
    if(res.statusCode == 202) {
      //success
    } else {
      console.log('Request failed. Rejecting bad status code ' + res.statusCode);
    }
  });

  botReq.on('error', function(err) {
    console.log('error posting message '  + JSON.stringify(err));
  });
  botReq.on('timeout', function(err) {
    console.log('timeout posting message '  + JSON.stringify(err));
  });
  botReq.end(JSON.stringify(body));
}

function webhoseScrape(textargsmax, peoplemax, placesmax, organizationsmax, imageFeature) {
/* [WebHose API call]:
  IN: message features,
  FUNCTION: gathers news;  --> postMessage() */

  var q = '(' + textargsmax + ')';
  /* query with image parameter */
  if (typeof imageFeature === 'undefined') {
    q = '(' + textargsmax + imageFeature  + ')';
  }

  var options = {
      format: 'json',
      language: 'english',
      site_type: 'news',
      size: 5
  };
   
  try {
      webhose.search(q, options, 
        function(err, resp) {
      if(err) console.log(err);
      else {
        var webhosedata = resp.data;
        console.log(webhosedata);
        postMessage(webhosedata);
      }
    });
  } catch (ex) {
    console.log(ex);
      switch (ex) {
          case webhose.errors.SearchArgumentException:
              console.log(ex);
              break;
      }
  }
}

function respond() {
/* [Triggers on a request to Heroku. Parses request and passes it to Indico]:
  IN: request,
  FUNCTION: Parse HTTP request, invoke Indico */
  var request = JSON.parse(this.req.chunks[0]) // In order to filter messages: set botRegex = /^./ here and '&& botRegex.test(request.text)' condition

  //Extract data from the message:
  var text = request.text; 
  var stringJson = JSON.stringify(request, null, 4);
  if (request.attachments[0] != undefined) {     //Define the attachments if there are any
    attachment =  request.attachments[0].url;
  } else {
    attachment = undefined;
  }

  //parse request for more info
  var user_id = request.user_id;
  var name = request.name;

  /*If the message is valid, begin the response process. */
  if(request.text && user_id != '348518') { //Note: user_id != [its own group me id] prevents message loop
    this.res.writeHead(200);
    indicoAnalysis(text, attachment, postMessage);
    this.res.end();
  } else {
    console.log("Invalid Message");
    this.res.writeHead(200);
    this.res.end();
  }
}

/* pass response to index.js */
exports.respond = respond;