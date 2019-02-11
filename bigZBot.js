var minimumValue = 70;
var repeatingtimePumping = 0.5;
var daysToLookAhead = 2;
var repeatingtimeForecast = 1;
var updateTime = 30; //in minutes
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
var chatId = '-311093887'; //big z newsletter
// var chatId = '569435436'; //muchete

var discharge;
var temperature;

//BOT STUFF
function initBot() {
  bot.start((ctx) => ctx.reply('Hello'));
  // // bot.on('new_chat_members', (ctx) => console.log(ctx.message.new_chat_members));
  bot.on('new_chat_members', (ctx) => welcome(ctx.message.new_chat_members));
  // bot.on('left_chat_participant', (ctx) => store(ctx.message));
	bot.command('update', (ctx) => getDischarge());
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


//Load file
function getDischarge() {
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

  if (last.Discharge > minimumValue) {
    // if (last.Discharge > 1000) {
    console.log("it's on!");
    var lastPump = new Date(log.pumping.last);

    //if its still pumping and no Pump-message has been sent in the last [0.5] days
    if (lastPump.addDays(repeatingtimePumping) < now) {
      getTemperature();
      setTimeout(function() {
        writeAlert(last);
      }, 500);
    } else {
      console.log('already wrote pumping too often');
    }

  } else if (last.Discharge <= minimumValue && log.lastDischarge > minimumValue) {
    // if it was pumping last time:
    writeOff(last.Discharge);
  } else {
    console.log('too low... - Checking forecast:');


    var lastForecast = new Date(log.forecast.last);
    if (lastForecast.addDays(repeatingtimeForecast) < now) {
      getForecast();
    } else {
      console.log('already wrote forecast too often');
    }

  }
  log.lastDischarge = last.Discharge;
}

function getTemperature() {
  getCSV('https://www.hydrodaten.admin.ch/graphs/2018/temperature_2018.csv')
    .then(rows => setTemperature(rows));
}

function setTemperature(t) {
  temperature = t[t.length - 1].Temperature;
}

function getForecast() {
  var url = 'https://www.hydrodaten.admin.ch/graphs/2018/deterministic_forecasts_2018.json';

  request({
    url: url,
    json: true
  }, function(error, response, body) {

    if (!error && response.statusCode === 200) {
      checkForecast(body) // Print the json response
    }
  })
}

function checkForecast(data) {
  data = data.forecastData.cosmoSeven;
  var firstVal = null;

  // first = new Date(data[0].datetime);
  // console.log(Date.parse(first));

  for (var i = 0; i < data.length; i++) {
    var thisDate = new Date(data[i].datetime);
    // if not in past and not more than 3 days ahead:
    if (thisDate > now && now.addDays(daysToLookAhead) > thisDate) {
      //if it's on
      if (!firstVal && data[i].value > minimumValue) {
        firstVal = {};
        firstVal.datetime = thisDate;
        firstVal.value = data[i].value;
      }
    }
  }
  if (firstVal) {
    console.log("Will be on!");
    writeForecast(firstVal);
  } else {
    console.log("Nothing in the next days...");
  }
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

function writeForecast(firstVal) {
  var days = ['Sunntig', 'Mäntig', 'Ziistig', 'Mittwuch', 'Dunstig', 'Fritig', 'Samstig'];

  msg = "*On hold!*"
  msg += "\n";
  msg += "🤙";
  msg += "\n";
  msg += "Am " + days[firstVal.datetime.getDay()] + ", " + firstVal.datetime.getHours() + ":00 sölls *" + Math.round(firstVal.value) + "*m³/s ha.";
  msg += "\n";
  msg += "Stay tuned! 🤙";
  msg += "\n";
  msg += "[View Forecast](https://www.hydrodaten.admin.ch/de/2018.html)";
  sendNews(msg);

  log.forecast.last = now;
  log.forecast.data = firstVal;
  log.last = now;
  storeLog();
}

function writeAlert(data) {
  date = data.Datetime;
  dis = data.Discharge;

  msg = "*Bremgarte Lauft!*";
  msg += "\n";
  msg += "🏄🏄‍♀️🏄🏄‍♀️🏄";
  msg += "\n";
  msg += "Wasserstand: *" + Math.round(dis) + "*m³/s";
  msg += "\n";
  msg += "Wassertemperatur: *" + Math.round(temperature) + "*°C";
  msg += "\n";
  msg += "[View Forecast](https://www.hydrodaten.admin.ch/de/2018.html)";
  sendNews(msg);

  log.pumping.last = now;
  log.pumping.data = data;
  log.last = now;
  storeLog();
}

function writeOff(dis) {

  msg = "*Off...*";
  msg += "\n";
  msg += "👎👎👎";
  msg += "\n";
  msg += "Wasserstand: *" + Math.round(dis) + "*m³/s";
  msg += "\n";
  msg += "Müend nümm gah.. Ziit zum Ukulele spiele!";
  msg += "\n";
  msg += "[View Forecast](https://www.hydrodaten.admin.ch/de/2018.html)";
  sendNews(msg);

  log.lastDischarge = dis;
  log.pumping.last = now.removeDays(repeatingtimePumping);
  log.last = now;
  storeLog();
}

function sendNews(txt) {
  // telegram.sendPhoto(chatId, 'https://static1.squarespace.com/static/54fc8146e4b02a22841f4df7/59510970b6ac5081d70c82c1/59510a04e4fcb533d1d699e7/1498483206213/13246243_1005206202889430_7912208575068447048_o.jpg');
  telegram.sendMessage(chatId, txt, {
    parse_mode: 'markdown'
  });
}

function testMessage() {
  telegram.sendMessage(chatId, 'Hello World!');
}

function storeLog() {
  // console.dir(JSON.stringify(log));
  fs.writeFileSync("BigZlog.json", JSON.stringify(log));
}

function store(file){
  fs.writeFileSync("file.json", JSON.stringify(file));
}

// function sendImage(){
// 	telegram.sendPhoto(chatId, 'https://static1.squarespace.com/static/54fc8146e4b02a22841f4df7/59510970b6ac5081d70c82c1/59510a04e4fcb533d1d699e7/1498483206213/13246243_1005206202889430_7912208575068447048_o.jpg');
// }

function start() {
  initBot();
  getDischarge();
  setInterval(getDischarge, updateTime * 1000 * 60);
}

start();
