var minimumValue = 80;
var repeatingtimePumping = 0.5;
var daysToLookAhead = 2;
var repeatingtimeForecast = 1;
var updateTime = 30; //in minutes
var days = ['Sunntig', 'Mäntig', 'Ziistig', 'Mittwuch', 'Dunstig', 'Fritig', 'Samstig'];

var now = new Date();

const getCSV = require('get-csv');
const fs = require('fs');
const request = require("request");
var log = JSON.parse(fs.readFileSync('BigZlog.json', 'utf8'));
var token = String(fs.readFileSync('token.txt', 'utf8'));
token = token.slice(0, -1);

const Telegraf = require('telegraf');
const bot = new Telegraf(token);
const Telegram = require('telegraf/telegram');
const telegram = new Telegram(token);
// var chatId = '-311093887'; //big z newsletter
var chatId = '569435436'; //muchete

var discharge;
var temperature;

// --------------------------------------------------------
// BOT STUFF
// --------------------------------------------------------
function initBot() {
  bot.start((ctx) => ctx.reply('Hello'));
  // // bot.on('new_chat_members', (ctx) => console.log(ctx.message.new_chat_members));
  bot.on('new_chat_members', (ctx) => welcome(ctx.message.new_chat_members));
  // bot.on('left_chat_participant', (ctx) => store(ctx.message));
	bot.command('update', (ctx) => update());
	bot.command('forecast', (ctx) => forceForecast());
	bot.command('status', (ctx) => forceStatus());
  bot.launch();
}

function welcome(people) {
  for (var i = 0; i < people.length; i++) {
    writeWelcome(people[i].first_name);
  }
}

function writeWelcome(name) {
  msg = "Wilkomme " + name;
  msg += "\n";
  msg += "Denk dra: Immer mit de Maserig!";
  sendNews(msg);
  sendZIsForZurfing();
  //All right, look. First of all, with the grain. With the grain. You see what I'm doing here? You let the tool do the work, you see? Just like you're riding the wave, you let the wave do the work. You don't fight the wave. You can't fight these big waves.
}

function sendZIsForZurfing() {
  telegram.sendPhoto(chatId, 'https://i.ytimg.com/vi/toCRvSihvIo/maxresdefault.jpg');
}

// --------------------------------------------------------
// FORCE FUNCTIONS
// --------------------------------------------------------

function forceStatus() {
  getCSV('https://www.hydrodaten.admin.ch/graphs/2018/discharge_2018.csv')
    .then(rows => forceStatusNow(rows));
}

function forceStatusNow(rows){
  var last = rows[rows.length - 1];
  getTemperature();
  setTimeout(function() {
    msg = "*Status*:";
    msg += "\n";
    msg += "*" + Math.round(last.Discharge) + "* m³/s";
    msg += "\n";
    msg += "*" + oneDecimal(temperature) + "* °C";
    sendNews(msg);
  }, 500);
}

function forceForecast() {
    var url = 'https://www.hydrodaten.admin.ch/graphs/2018/deterministic_forecasts_2018.json';

    request({
      url: url,
      json: true
    }, function(error, response, body) {

      if (!error && response.statusCode === 200) {
        forceForecastNow(body.forecastData.cosmoSeven); // handle the json response
      }
    })
}


function forceForecastNow(cosmoSeven) {
  var niceForecast = null;

  msg = "*Forecast*:";

  //looping through forecast data
  for (var i = 0; i < cosmoSeven.length; i++) {
    var thisDate = new Date(cosmoSeven[i].datetime);
    msg += "\n";
    msg += days[thisDate.getDay()] + " " + ('0'+thisDate.getHours()).slice(-2) + ":00 – *" + Math.round(cosmoSeven[i].value) + "*m³/s";
  }
  sendNews(msg);
}

// --------------------------------------------------------
// Load STUFF / Other Functions
// --------------------------------------------------------
function lastMessage(){
  return log.lastMessage;
}

Date.prototype.addDays = function(days) {
  var date = new Date(this.valueOf());
  date.setDate(date.getDate() + days);
  return date;
}

Date.prototype.removeDays = function(days) {
  var date = new Date(this.valueOf());
  date.setDate(date.getDate() - days);
  return date;
}

// Date.prototype.addHours = function(h) {
//    this.setTime(this.getTime() + (h*60*60*1000));
//    return this;
// }

function oneDecimal(n){
  return Math.round(n*10)/10;
}

function storeLog() {
  // console.dir(JSON.stringify(log));
  fs.writeFileSync("BigZlog.json", JSON.stringify(log));
}

function store(file){
  fs.writeFileSync("file.json", JSON.stringify(file));
}

// --------------------------------------------------------
// LIVE STATUS FUNCTIONS
// --------------------------------------------------------

function update() {
  getCSV('https://www.hydrodaten.admin.ch/graphs/2018/discharge_2018.csv')
    .then(rows => setDischarge(rows));
}

function setDischarge(d) {
  discharge = d;
  checkDischarge();
}

function checkDischarge() {
  var last = discharge[discharge.length - 1];
  console.log('Reuss is currently at: ' + last.Discharge + ' m³/s');

  //new
  if (last.Discharge > minimumValue) {
    console.log("it's on!");
    if (lastMessage() == "pumping"){
      var lastPumpMessage = new Date(log.lastPumpMessage);
      if (lastPumpMessage.addDays(repeatingtimePumping) < now) {
        //if hasn't sent message in a while, write that it is still on!
        console.log("Time for a pump reminder message");
        getTemperature();
        setTimeout(function() {
          writeStillON(last);
        }, 500);
      } else {
        console.log("Not yet time for a pump reminder message");
      }
    } else {
      getTemperature();
      //wait for temperature to be loaded...
      setTimeout(function() {
        writeON(last);
      }, 500);
    }
  } else {
    if (lastMessage() == "pumping"){
      // if was pumping before, write off message
      console.log("Not pumping anymore... Sending message now");
      writeOff(last.Discharge);
      log.lastForecastMessage = new Date(1999); //dummy year to reset the last forecast time
    }

    console.log('too low... - Checking forecast:');
    //will be on in a few days?
    getForecast();
  }
}

function getTemperature() {
  getCSV('https://www.hydrodaten.admin.ch/graphs/2018/temperature_2018.csv')
    .then(rows => setTemperature(rows));
}

function setTemperature(t) {
  temperature = t[t.length - 1].Temperature;
}

// --------------------------------------------------------
// FORECAST FUNCTIONS
// --------------------------------------------------------

function getForecast(){
  var url = 'https://www.hydrodaten.admin.ch/graphs/2018/deterministic_forecasts_2018.json';

  request({
    url: url,
    json: true
  }, function(error, response, body) {

    if (!error && response.statusCode === 200) {
      checkForecast(body.forecastData.cosmoSeven); // handle the json response
    }
  })
}

function checkForecast(cosmoSeven) {
  var niceForecast = null;

  //sorting forecast data
  for (var i = 0; i < cosmoSeven.length; i++) {
    var thisDate = new Date(cosmoSeven[i].datetime);
    // if not in past and not more than 3 days ahead:
    if (thisDate > now && now.addDays(daysToLookAhead) > thisDate) {
      //if it's on
      if (!niceForecast && cosmoSeven[i].value > minimumValue) {
        niceForecast = {};
        niceForecast.datetime = thisDate;
        niceForecast.value = cosmoSeven[i].value;
      }
    }
  }

  //evaluating forecast data
  if (niceForecast) {
    console.log("Will be on!");

    var lastForecastMessage = new Date(log.lastForecastMessage);

    if (lastForecastMessage.addDays(repeatingtimeForecast) < now || log.lastMessage != "forecast") {
      writeForecast(niceForecast);
      console.log("Sent Forecast");
    } else {
      console.log("Too early to send another forecast");
    }

  } else {
    console.log("Nothing in the next days...");

    var nextForecast = new Date(log.nextForecast);
    //if forecast was made that is not on anymore:
    if (nextForecast > now) {
      console.log("Will not be on anymore");
      writeNothingInSight();
    }
  }
}

// --------------------------------------------------------
// Send messages
// --------------------------------------------------------

function testMessage() {
  telegram.sendMessage(chatId, 'Hello World!');
}

function writeForecast(forecastData) {

  msg = "*On hold! 🤙*"
  msg += "\n";
  msg += "Am " + days[forecastData.datetime.getDay()] + ", " + forecastData.datetime.getHours() + ":00 sölls *" + Math.round(forecastData.value) + "*m³/s ha.";
  msg += "\n";
  msg += "[View Forecast](https://www.hydrodaten.admin.ch/de/2018.html)";
  sendNews(msg);

  //new
  log.lastForecastMessage = now;
  log.nextForecast = forecastData.datetime;
  log.lastMessage = "forecast";

  //old
  // log.forecast.last = now;
  // log.forecast.data = forecastData;
  // log.last = now;
  storeLog();
}

function writeON(data) {

  msg = "*Bremgarte Lauft!*";
  msg += "\n";
  msg += "🏄🏄‍♀️🏄🏄‍♀️🏄";
  msg += "\n";
  msg += "Wasserstand: *" + Math.round(data.Discharge) + "*m³/s";
  msg += "\n";
  msg += "Wassertemperatur: *" + oneDecimal(temperature) + "*°C";
  msg += "\n";
  msg += "[View Forecast](https://www.hydrodaten.admin.ch/de/2018.html)";
  sendNews(msg);

  //new
  log.lastMessage = "pumping";
  log.lastPumpMessage = now;

  //old
  // log.pumping.last = now;
  // log.pumping.data = data;
  // log.last = now;
  storeLog();
}

function writeStillON(data) {

  msg = "*Still On! 🏄🏄‍♀️*";
  msg += "\n";
  msg += "*" + Math.round(data.Discharge) + "*m³/s & *" + oneDecimal(temperature) + "*°C";
  msg += "\n";
  msg += "[View Forecast](https://www.hydrodaten.admin.ch/de/2018.html)";
  sendNews(msg);

  //new
  log.lastMessage = "pumping";
  log.lastPumpMessage = now;

  //old
  // log.pumping.last = now;
  // log.pumping.data = data;
  // log.last = now;
  storeLog();
}

function writeOff(dis) {

  msg = "*Off...*";
  msg += "\n";
  msg += Math.round(dis) + "*m³/s 👎👎👎";
  msg += "\n";
  msg += "[View Forecast](https://www.hydrodaten.admin.ch/de/2018.html)";
  sendNews(msg);

  //new
  log.lastMessage = "off";

  //old
  // log.lastDischarge = dis;
  // log.pumping.last = now.removeDays(repeatingtimePumping);
  // log.last = now;
  storeLog();
}

function writeNothingInSight(){
  msg = "*Sorry, kei Swell meh in Sicht. 👎";
  msg += "\n";
  msg += "[View Forecast](https://www.hydrodaten.admin.ch/de/2018.html)";
  sendNews(msg);

  //new
  log.nextForecast = new Date(1999);
  log.lastMessage = "off";

  //old
  // log.lastDischarge = dis;
  // log.pumping.last = now.removeDays(repeatingtimePumping);
  // log.last = now;
  storeLog();
}

function sendNews(txt) {
  // telegram.sendPhoto(chatId, 'https://static1.squarespace.com/static/54fc8146e4b02a22841f4df7/59510970b6ac5081d70c82c1/59510a04e4fcb533d1d699e7/1498483206213/13246243_1005206202889430_7912208575068447048_o.jpg');
  telegram.sendMessage(chatId, txt, {
    parse_mode: 'markdown'
  });
}

// function sendImage(){
// 	telegram.sendPhoto(chatId, 'https://static1.squarespace.com/static/54fc8146e4b02a22841f4df7/59510970b6ac5081d70c82c1/59510a04e4fcb533d1d699e7/1498483206213/13246243_1005206202889430_7912208575068447048_o.jpg');
// }

// --------------------------------------------------------
// MAIN FUNCTION
// --------------------------------------------------------

function start() {
  initBot();
  update();
  setInterval(update, updateTime * 1000 * 60);
}

start();
