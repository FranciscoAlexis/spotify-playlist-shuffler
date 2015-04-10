/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var _ = require('lodash');
var async = require('async');


var fs = require('fs');
var params = JSON.parse(fs.readFileSync('credentials', 'utf8'));

var client_id = params.clientId; // Your client id
var client_secret = params.clientSecret; // Your client secret
var redirect_uri = params.redirectUri; // Your redirect uri
var scopes = params.scopes;

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cookieParser());

app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scopes,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          console.log(body);
        });

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

app.get('/randomize/:userId/:playlistId/:access_token', function(req, res) {
  var playlistId    = req.params.playlistId;
  var userId        = req.params.userId;
  var access_token  = req.params.access_token;

  var authOptions = {
    url: 'https://api.spotify.com/v1/users/'+userId+'/playlists/'+playlistId+'/tracks?limit=100&offset=0',
    headers: { 'Authorization': 'Bearer ' + access_token },
    // form: {
    //   grant_type: 'refresh_token',
    //   refresh_token: refresh_token
    // },
    json: true
  };

  request.get(authOptions, function(error, response, body) {

    var trackIds = [];
    var totalTracks = 0;
    var tracksGetted = 0;
    if (!error && response.statusCode === 200) {
      totalTracks = body.total;

      _.forEach(body.items, function(n, key) {
        tracksGetted++;
        trackIds.push(n.track.uri);
      });

      if(totalTracks > 100)
      {
          async.whilst(
              function () { return tracksGetted < totalTracks; },
              function (callback) {
                  var authOptions = {
                    url: 'https://api.spotify.com/v1/users/'+userId+'/playlists/'+playlistId+'/tracks?limit=100&offset='+tracksGetted,
                    headers: { 'Authorization': 'Bearer ' + access_token },
                    json: true
                  };

                  request.get(authOptions, function(cerror, response, cbody) {
                        if (!cerror && response.statusCode === 200) {
                          _.forEach(cbody.items, function(n, key) {
                            tracksGetted++;
                            trackIds.push(n.track.uri);
                          });
                          callback();
                        }
                        else
                        {
                          callback(cerror);
                        }
                  });
              },
              function (err) {
                if(!err)
                {
                  var shuffeledTracks = _.shuffle(trackIds);
                  var firstTracks = shuffeledTracks.slice(0,100);
                  var tracksputted = 100;
                  console.log(shuffeledTracks);
                  console.log('total tracks:',shuffeledTracks.length);
                  console.log('\n');
                  console.log(firstTracks);
                  
                  var putOptions = {
                    url: 'https://api.spotify.com/v1/users/'+userId+'/playlists/'+playlistId+'/tracks',
                    headers: { 'Authorization': 'Bearer ' + access_token },
                    body: {
                      uris : firstTracks  
                    },
                    json: true
                  };

                  request.put(putOptions,function(error,response,body){
                    if (!error && response.statusCode === 201) {
                      var off = shuffeledTracks.length - tracksputted > 100 ? 100 : shuffeledTracks.length - tracksputted;
                      var nextTracks = shuffeledTracks.slice(tracksputted,(tracksputted + off));
                      console.log('\n');
                      console.log(nextTracks);
                      async.whilst(
                        function () { return tracksputted < totalTracks; },
                        function (callback) {
                            var postOptions = {
                            url: 'https://api.spotify.com/v1/users/'+userId+'/playlists/'+playlistId+'/tracks',
                            headers: { 'Authorization': 'Bearer ' + access_token },
                            body: {
                              uris : nextTracks  
                            },
                            json: true
                          };  
                          request.post(putOptions,function(error,response,body){
                            if (!error && response.statusCode === 201) {
                              tracksputted+=off;
                               off = shuffeledTracks.length - tracksputted > 100 ? 100 : shuffeledTracks.length - tracksputted;
                               nextTracks = shuffeledTracks.slice(tracksputted,(tracksputted + off));
                               console.log('\n');
                               console.log(nextTracks);
                              callback();    
                            }
                            else
                            {
                              callback(error);
                            }
                          });
                        },
                        function(err)
                        {
                            if(!err){
                              res.send("Success");
                            }else{
                              console.log(err);
                              res.status(500).send(error)
                            }
                        }
                      );
                    }
                    else
                    { 
                      console.log(error,response.statusCode,response.statusMessage);
                      res.status(500).send(error)
                    }
                  });
                }
                else
                {
                  res.status(500).send(err); 
                }
                  
              }
          );
      }
      else
      {
       
          var shuffeledTracks = _.shuffle(trackIds);

          var putOptions = {
            url: 'https://api.spotify.com/v1/users/'+userId+'/playlists/'+playlistId+'/tracks',
            headers: { 'Authorization': 'Bearer ' + access_token },
            body: {
              uris : shuffeledTracks  
            },
            json: true
          };

          request.put(putOptions,function(error,response,body){
            if (!error && response.statusCode === 201) {
              res.send("Success");
            }
            else
            {
              console.log(error,response.statusCode);
              res.status(500).send(error)
            }
          });
      } 
    }
    else{
      console.log(error);
      console.log(response.statusCode);
      res.status(500).send(error);  
    }
  });
});

console.log('Listening on 8888');
app.listen(8888);
