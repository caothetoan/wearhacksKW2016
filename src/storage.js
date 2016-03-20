'use strict';

var AWS = require("aws-sdk");
// test node file

var Firebase = require("firebase");
var contactRef = new Firebase("https://jarvis-two.firebaseio.com/contacts");
var originRef = new Firebase("https://jarvis-two.firebaseio.com/currentLocation");
var destinationRef = new Firebase("https://jarvis-two.firebaseio.com/addresses");
var navigationRef = new Firebase("https://jarvis-two.firebaseio.com/navigation");
var authentication = require("./auth");

var google = require('google-distance-matrix');

var accountSid = authentication.accountSid();
var authToken = authentication.authToken();

var googleKey = authentication.googleKey();
var googleMapsDirectionKey = authentication.googleMapsDirectionKey();


var client = require('twilio')(accountSid, authToken);

var https = require("https");
var mapsResponseObject = {};
//https://www.google.ca/maps/search/43.486266,-80.5549554
function dist (origin, destination, key, callback){
    var options = {
        host: 'www.google.ca',
        path: '/maps/api/directions/json?origin=' + origin + '&destination=' + destination + '&key=' + key,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    console.log(options.host + options.path);

    var req = https.request(options, function(res) {
        var output = '';
        res.setEncoding('utf8');

        res.on('data', function (chunk) {
            output += chunk;
        });

        res.on('end', function() {
            console.log(output);
            mapsResponseObject = JSON.parse(output);
            console.log(mapsResponseObject.routes[0].legs[0].distance.text);
            console.log(mapsResponseObject.routes[0].legs[0].duration.text);
            

            callback({
                'distance': mapsResponseObject.routes[0].legs[0].distance.text,
                'duration': mapsResponseObject.routes[0].legs[0].duration.text
            });

        });
    });
    req.end();

    req.on('error', function(err) {
        console.log("error: " + err)
    });
}

function keysToLowerCase(obj){
    Object.keys(obj).forEach(function (key) {
        var k = key.toLowerCase();

        if (k !== key) {
            obj[k] = obj[key];
            delete obj[key];
        }
    });
    return (obj);
}

function reverseGeocode (coordinates, callback) {
    var latlng = {lat: parseFloat(coordinates.lat), lng: parseFloat(coordinates.lng)};

    var options = {
        host: 'maps.googleapis.com',
        path: '/maps/api/geocode/json?latlng=' + latlng.lat + '%2C' + latlng.lng + '&sensor=true',
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    };

    var req = https.request(options, function(res) {
        var output = '';
        res.setEncoding('utf8');

        res.on('data', function (chunk) {
            output += chunk;
        });
        res.on('end', function() {
            mapsResponseObject = JSON.parse(output);
            console.log(mapsResponseObject.results[0].formatted_address);
            callback(mapsResponseObject.results[0].formatted_address);
        });
    });
    req.end();

    req.on('error', function(err) {
        console.log("error: " + err)
    });

}

function geocode (address, callback) {
    // var latlng = {lat: parseFloat(coordinates.lat), lng: parseFloat(coordinates.lng)};
// https://maps.googleapis.com/maps/api/geocode/json?address=Canada&key=AIzaSyDRyCck2HAW8gN78iTR5zHatosACk-HABU
    var options = {
        host: 'maps.googleapis.com',
        path: '/maps/api/geocode/json?address=' + address.replace(new RegExp(' ', 'g'), "+") + ',Canada' + '&key=' + googleKey,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    };

    var req = https.request(options, function(res) {
        var output = '';
        res.setEncoding('utf8');

        res.on('data', function (chunk) {
            output += chunk;
        });
        res.on('end', function() {
            mapsResponseObject = JSON.parse(output);
            // callback(mapsResponseObject.results[0].formatted_address);
            // console.log(mapsResponseObject.results[0].geometry.location);
            callback(mapsResponseObject.results[0].geometry.location);
        });
    });
    req.end();

    req.on('error', function(err) {
        console.log("error: " + err)
    });

}

var MYNUMBER = "+12262711162";

var HELP_MESSAGE = "This is a test message; don't call 911";

function getNumber(name, callback){
    contactRef.once("value", function(snapshot){
        if (snapshot.val()) {
            if (keysToLowerCase(snapshot.val())[name.toLowerCase()]) {
                callback(keysToLowerCase(snapshot.val())[name.toLowerCase()]);
            }
            else {
                callback();
            }
        }
        else {
            callback();
        }
        
    });
}

function getAddress(name, callback){
    destinationRef.once("value", function(snapshot){
        if (keysToLowerCase(snapshot.val())[name.toLowerCase()]) {
            console.log("get address");
            console.log(keysToLowerCase(snapshot.val())[name.toLowerCase()]);
            callback(keysToLowerCase(snapshot.val())[name.toLowerCase()]);
        }
        else {
            callback();
        }
    });
}


function parseAndUploadSteps(mapsResponse){
    // console.log(mapsResponse.routes[0].legs[0]);
    console.log(mapsResponse.routes[0].legs[0].steps);
    var steps = mapsResponse.routes[0].legs[0].steps;
    var stepsArray = [];

    for(var step = 0; step < steps.length; step++) {
        stepsArray.push(steps[step].html_instructions.replace(new RegExp('<[^>]*>', 'g'), " "));
    }
    navigationRef.child('steps').set(stepsArray);
    navigationRef.child('stepIndex').set(0);
    // updateIndex(0);
};

var storage = (function () {
    return {
        sendText: function (dataObject, callback) {
            getNumber(dataObject.name, function(number){
                console.log(number);
                client.messages.create({ 
                    to: "+1" + number, 
                    from: MYNUMBER, 
                    body: dataObject.message
                }, function(err, message) { 
                    if (err)
                        console.log("Error: " + err);
                    else
                        callback("success");
                });

            })
        },
        getNextStep: function(callback){
            console.log("called");
            navigationRef.child('steps').once("value", function(stepsSnapshot){
                navigationRef.child('stepIndex').once("value", function(stepIndexSnapshot){
                    var stepsObject = stepsSnapshot.val();
                    var stepObjectIndex = parseInt(stepIndexSnapshot.val());
                    stepObjectIndex++;
                    if(stepObjectIndex < stepsObject.length){
                        navigationRef.child('stepIndex').set(stepObjectIndex);
                        callback(stepsObject[stepObjectIndex]);
                    } else {
                        callback("No steps reminaing");
                    }
                });
            })
        },
        getDirectionsByName: function (slotName, callback) {
            var addressName = slotName;
            console.log(addressName);
            var myOrigin = {};
            var addresses = {};
            var path;
            originRef.once("value", function(originSnapshot) {
                myOrigin = originSnapshot.val();

                destinationRef.once("value", function(destinationSnapshot){
                    addresses = destinationSnapshot.val();
                    if(addressName in addresses){
                        var addressString = addresses[addressName].replace(new RegExp(' ', 'g'), "+");

                        path = "/maps/api/directions/json?" 
                        + "origin=" + myOrigin.lat + "," + myOrigin.lng
                        + "&destination=" + addressString
                        + "&key=" + googleMapsDirectionKey;

                        var options = {
                            host: 'maps.googleapis.com',
                            path: path,
                            method: 'GET',
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        };

                        console.log(options.host + options.path);

                        var req = https.request(options, function(res) {
                            var output = '';
                            res.setEncoding('utf8');

                            res.on('data', function (chunk) {
                                output += chunk;
                            });

                            res.on('end', function() {
                                var responseObject = JSON.parse(output);
                                var responseString = "Navigating to: " + addresses[addressName] + ". Step one: " + responseObject.routes[0].legs[0].steps[0].html_instructions.replace(new RegExp('<[^>]*>', 'g'), " ");
                                parseAndUploadSteps(responseObject);
                                callback(responseString);
                            });
                        });
                        req.end();

                        req.on('error', function(err) {
                            console.log('error fetching');
                            callback("Error connecting to server")
                        });
                    } else {
                        console.log('cannot find address');
                        callback("Cannot find address for " + addressName);
                    }
                });
            });
        },
        getDistanceByName: function (name, callback) {
            var myOrigin = {};
            //var myDestination = {};

            originRef.orderByKey().once("value", function(snapshot){
                myOrigin = snapshot.val();




                getAddress(name, function(address){
                    console.log('snapshot ');
                    console.log(snapshot.val());
                    geocode(address, function(latlng){
                        console.log(latlng);
                        dist(myOrigin.lat + ',' + myOrigin.lng, latlng.lat + ',' + latlng.lng, googleMapsDirectionKey, function(data){
                            callback(data);
                        });
                    })
                })
                    
            });
            
        },
        getSpeedLimit: function (dataObject, callback) {
            //Speed limits This service returns the posted speed limit for a road 
            //segment. The Speed Limit service is only available to Google Maps APIs 
            //Premium Plan customers. 
        },
        sendLocation: function (name, callback) {
            storage.getCurrentLocation(function (data, coordinates) {
                storage.sendText({
                    name: name,
                    // message: "I am currently at " + data
                    message: "I am currently at " + data + ". " + "https://www.google.ca/maps/search/" + coordinates.lat + "," + coordinates.lng
                }, function (success) {
                    console.log("sent location");
                    console.log(success);
                    callback(success);

                });
            });
        },
        getCurrentSpeed: function (callback) {

        },
        getCurrentLocation: function (callback) {
            
            originRef.once("value", function (snapshot){
                var coordinates = {};
                snapshot.forEach(function(childSnapshot){
                    coordinates[childSnapshot.key()] = childSnapshot.val();
                })
                console.log(coordinates);
                reverseGeocode(coordinates, function(data) {
                    callback(data, coordinates);
                });
            });
            

            
        },
        getHelp: function (callback) {
            contactRef.orderByKey().once("value", function (snapshot){
                snapshot.forEach(function (childSnapshot){
                    // storage.sendText({'name': childSnapshot.key(), 'message': "Distress signal from " +  + });
                    storage.getCurrentLocation(function (data, coordinates) {
                        storage.sendText({
                            name: childSnapshot.key(),
                            message: "Distress signal from " + data + ". " + "https://www.google.ca/maps/search/" + coordinates.lat + "," + coordinates.lng,
                        }, function (success) {
                            console.log("sent help");
                            console.log(success);
                            callback(success);
                        });
                    });
                })
            });
        }


    };
})();

// var dataObject = {
//     slotName: "home"
// }

// storage.getNextStep(function(data) {
//     console.log("succes");
//     console.log(data);
// });
// storage.getDirectionsByName(dataObject, function (data){
// });

// storage.getDistanceByName('home', function (data){
//     console.log(data);
// });

// storage.sendText({
//     name: 'milan',
//     message: 'johncena.mp3'
// }, function () {
//     console.log("success");
// });

// storage.getDirectionsByName("home", function (data) {
//     console.log("success");
//     console.log(data);
// });

// storage.sendLocation('veljko',function (data) {
//     console.log("success");
//     console.log(data);
// });


// storage.getHelp(function (data) {
//     console.log("success");
//     console.log(data);
// });


// geocode('Canada',function (data) {
//     console.log("success");
//     console.log(data);
// });

// getNumber('Milan', function (data) {
//     console.log("success");
//     console.log(data);
// });
module.exports = storage;