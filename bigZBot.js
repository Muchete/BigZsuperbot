var minimumValue;
var minimumValueOff; //value that he doesn't instantly change from on to off
var maximumValue = 400;
var repeatingtimePumping = 0.5;
var daysToLookAhead = 2;
var repeatingtimeForecast = 1;
var updateTime = 30; //in minutes
var days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
var symbols = ['✕', '🏄', '☠️'];
var msg;

//Scene vars
let kb;
let tempNumber;

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
const Session = require('telegraf/session')
const Stage = require('telegraf/stage')
const Scene = require('telegraf/scenes/base')
const Extra = require('telegraf/extra')
const Markup = require('telegraf/markup')
const { enter, leave } = Stage
// var newsletterChatId = '-311093887'; //big z newsletter
var newsletterChatId = '569435436'; //@muchete

var discharge;
var temperature;

// --------------------------------------------------------
// BOT STUFF
// --------------------------------------------------------
function initBot() {
  //Set Values
  calcDischargeValue();

  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('Gah Weg', 'delete'),
    Markup.callbackButton('Status', 'status'),
    Markup.callbackButton('Forecast', 'forecast')
  ], {
    // columns: 2
  })

  bot.telegram.getMe().then((botInfo) => {
    bot.options.username = botInfo.username
  })

  bot.start((ctx) => ctx.reply('Hallo ' + ctx.from.first_name + '\nNeed /help?'))
  bot.help((ctx) => ctx.reply('Wenn min Name (Big Z) erwähnsch chumi zur Hilf!\nOder du frögsch direkt mit eim vo dene Befehl: \n- /status\n- /forecast'))

  //GROUP CHAT STUFF
  bot.on('new_chat_members', (ctx) => welcome(ctx.message.new_chat_members))
  bot.on('left_chat_member', (ctx) => ctx.reply("Wiiter so " + ctx.message.left_chat_member.first_name + ", eine weniger uf de Welle!"));

  //AUTO ANSWER STUFF
  bot.hears(/big z/i, (ctx) => ctx.reply('Wie chani helfe?', Extra.markup(keyboard)));
  bot.hears(/Z/, (ctx) => ctx.reply('Wie chani helfe?', Extra.markup(keyboard)));
  // bot.on('message', (ctx) => ctx.reply('Wie chani der helfe?', Extra.markup(keyboard)))

  //FUNKTIONE
  bot.action('delete', ({
    deleteMessage
  }) => deleteMessage())
  bot.action('forecast', (ctx) => sendForecast(ctx.chat.id))
  bot.action('status', (ctx) => sendStatus(ctx.chat.id))
  bot.command('forecast', (ctx) => sendForecast(ctx.chat.id))
  bot.command('status', (ctx) => sendStatus(ctx.chat.id))
  bot.command('update', (ctx) => update())
  bot.command('barrel', (ctx) => sendBarrelVideo(ctx.chat.id))
  bot.command('zwasple', (ctx) => zwasple(ctx))
  bot.command('log', (ctx) => console.log(ctx.from.first_name))

  //SCENE THINGS (used to set value)
  bot.use(Session())
  bot.use(stage.middleware())
  bot.command('set', enter('set'))

  bot.launch()
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
  telegram.sendPhoto(newsletterChatId, 'https://i.ytimg.com/vi/toCRvSihvIo/maxresdefault.jpg');
}

// --------------------------------------------------------
// SCENE FUNCTIONS - SET VALUE
// --------------------------------------------------------

const setScene = new Scene('set')
setScene.enter((ctx) => ctx.reply('Hallo. Ab wieviel m³/s sölli eu bscheid geh? Im Moment isch es ' + log.dischargeValue + 'm³/s.\nDruck /Abbruch, falls nüt ändere wotsch.'))
setScene.leave((ctx) => ctx.reply('Ok, tschüss. Es isch jetzt uf ' + log.dischargeValue + 'm³/s.'))
setScene.command('Abbruch', leave())
setScene.on('text', (ctx) => ctx.reply(handleText(ctx), Extra.markup(kb)))
const stage = new Stage([setScene], { ttl: 10 })

function handleText(ctx){
  let txt = ctx.message.text;
  let re = new RegExp('\\d{2,3}', 'i');
  let num = txt.match(re);
  let text;

  kb = Markup.keyboard([
    Markup.callbackButton('Ja'),
    Markup.callbackButton('Nei')
  ], {
    // columns: 2
  })

  let emptyKeyboard = Markup.removeKeyboard(true);

  if( txt == 'Ja' && tempNumber){
    kb = emptyKeyboard;
    setVal(ctx);
    text = 'Has mer gmerkt. 👍🏾';
    tempNumber = false;
  } else if (txt == 'Nei' && tempNumber){
    kb = emptyKeyboard;
    text = 'Ok, nächst Versuech. Ab wieviel m³/s sölli eu bscheid geh?';
  } else if (num) {
    tempNumber = num[0];
    text = 'Stimmt ' + tempNumber + 'm³/s ?';
  } else {
    tempNumber = false;
    kb = false; //override keyboard
    text = 'Sorry, das hani nöd verstande. Ab wieviel m³/s sölli eu Bscheid geh?'
  }

  return text;

  function setVal(ctx){
    console.log('Setting dischargeValue to: '+tempNumber);
    setDischargeValue(tempNumber);
    ctx.scene.leave();
  }
}

// --------------------------------------------------------
// FORCE FUNCTIONS
// --------------------------------------------------------

function sendStatus(chat_id) {
  getCSV('https://www.hydrodaten.admin.ch/graphs/2018/discharge_2018.csv')
    .then(rows => sendStatusNow(chat_id, rows));
}

function sendStatusNow(chat_id, rows) {
  var last = rows[rows.length - 1];
  getTemperature();
  setTimeout(function() {
    msg = "*Status*: " + getSymbol(last.Discharge);
    msg += "\n";
    msg += "*" + Math.round(last.Discharge) + "* m³/s";
    msg += "\n";
    msg += "*" + oneDecimal(temperature) + "* °C";
    sendTo(chat_id, msg);
  }, 500);
}

function sendForecast(chat_id) {
  var url = 'https://www.hydrodaten.admin.ch/graphs/2018/deterministic_forecasts_2018.json';

  request({
    url: url,
    json: true
  }, function(error, response, body) {

    if (!error && response.statusCode === 200) {
      sendForecastNow(chat_id, body.forecastData.cosmoSeven); // handle the json response
    }
  })
}


function sendForecastNow(chat_id, cosmoSeven) {
  var niceForecast = null;

  // msg = "🕐 *Forecast*:";
  msg = "*Forecast*:";

  //looping through forecast data
  for (var i = 0; i < cosmoSeven.length; i++) {
    var thisDate = new Date(cosmoSeven[i].datetime);
    msg += "\n";
    // msg += days[thisDate.getDay()] + " " + ('0'+thisDate.getHours()).slice(-2) + ":00 – *" + Math.round(cosmoSeven[i].value) + "*m³/s";
    msg += getSymbol(cosmoSeven[i].value) + " " + days[thisDate.getDay()] + " " + ('0' + thisDate.getHours()).slice(-2) + ":00 – *" + Math.round(cosmoSeven[i].value) + "* m³/s";
    // msg += getSymbol(cosmoSeven[i].value) + " *" + Math.round(cosmoSeven[i].value) + "* m³/s – " + days[thisDate.getDay()] + ", " + ('0'+thisDate.getHours()).slice(-2) + ":00";
  }
  sendTo(chat_id, msg);
}

// --------------------------------------------------------
// Load STUFF / Other Functions
// --------------------------------------------------------
function calcDischargeValue(){
  minimumValue = log.dischargeValue;
  minimumValueOff = minimumValue - 10; //value that he doesn't instantly change from on to off
}

function setDischargeValue(v){
  log.dischargeValue = v;
  minimumValue = log.dischargeValue;
  minimumValueOff = minimumValue - 10; //value that he doesn't instantly change from on to off
  storeLog();
}

function getSymbol(val) {
  if (val > maximumValue) {
    return symbols[2];
  } else if (val > minimumValue) {
    return symbols[1];
  } else {
    return symbols[0];
  }
}

function lastMessage() {
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

function oneDecimal(n) {
  return Math.round(n * 10) / 10;
}

function storeLog() {
  // console.dir(JSON.stringify(log));
  fs.writeFileSync("BigZlog.json", JSON.stringify(log));
}

function store(file) {
  fs.writeFileSync("file.json", JSON.stringify(file));
}

// --------------------------------------------------------
// LIVE STATUS FUNCTIONS
// --------------------------------------------------------

function update() {
  console.log("--------");
  console.log("Running Update Function");
  console.log("\n");
  getCSV('https://www.hydrodaten.admin.ch/graphs/2018/discharge_2018.csv')
    .then(rows => setDischarge(rows));
}

function setDischarge(d) {
  discharge = d;
  checkDischarge();
}

function checkDischarge() {
  var last = discharge[discharge.length - 1];
  last.Discharge = parseFloat(last.Discharge);
  console.log('Reuss is currently at: ' + last.Discharge + ' m³/s');

  //checking current status
  if (last.Discharge > Math.round(minimumValue)) {
    console.log("it's on!");
    if (lastMessage() == "pumping") {
      var lastPumpMessage = new Date(log.lastPumpMessage);
      if (lastPumpMessage.addDays(repeatingtimePumping) < now) {
        //if hasn't sent message in a while, write that it is still on!
        console.log("Time for a pump reminder message");
        getTemperature();
        sendReminderVideo();
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
    console.log("\n");
    console.log("End of Update");
    console.log("--------");
  } else if (last.Discharge <= Math.round(minimumValueOff)) {
    if (lastMessage() == "pumping") {
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

function getForecast() {
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
    cosmoSeven[i].value = parseFloat(cosmoSeven[i].value);
    // if not in past and not more than 3 days ahead:
    if (thisDate > now && now.addDays(daysToLookAhead) > thisDate) {
      //if it's on
      if (!niceForecast && cosmoSeven[i].value > minimumValue + 80) {
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
  console.log("\n");
  console.log("End of Update");
  console.log("--------");
}

// --------------------------------------------------------
// Send messages
// --------------------------------------------------------

function testMessage() {
  telegram.sendMessage(newsletterChatId, 'Hello World!');
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

  msg = "*Still On!* 🏄🏄‍♀️";
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
  msg += "*" + Math.round(dis) + "*m³/s 👎👎👎";
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

function writeNothingInSight() {
  msg = "*Sorry, kei Swell meh in Sicht.* 👎";
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
  // telegram.sendPhoto(newsletterChatId, 'https://static1.squarespace.com/static/54fc8146e4b02a22841f4df7/59510970b6ac5081d70c82c1/59510a04e4fcb533d1d699e7/1498483206213/13246243_1005206202889430_7912208575068447048_o.jpg');
  telegram.sendMessage(newsletterChatId, txt, {
    parse_mode: 'markdown'
  });
}

function sendTo(to, txt) {
  // telegram.sendPhoto(newsletterChatId, 'https://static1.squarespace.com/static/54fc8146e4b02a22841f4df7/59510970b6ac5081d70c82c1/59510a04e4fcb533d1d699e7/1498483206213/13246243_1005206202889430_7912208575068447048_o.jpg');

  telegram.sendMessage(to, txt, {
    parse_mode: 'markdown'
  });
}

function zwasple(ctx) {
  var to = ctx.chat.id;
  // telegram.sendPhoto(newsletterChatId, 'https://static1.squarespace.com/static/54fc8146e4b02a22841f4df7/59510970b6ac5081d70c82c1/59510a04e4fcb533d1d699e7/1498483206213/13246243_1005206202889430_7912208575068447048_o.jpg');
  txt = ctx.from.first_name + "?";
  txt = "Need Help, [" + txt + "](https://www.google.ch/search?q=Jennifer+Aniston&source=lnms&tbm=isch&sa=X&ved=0ahUKEwiZhd7r2fLhAhVAwcQBHdzaA_oQ_AUIDigB&biw=1680&bih=916&dpr=2)";

  telegram.sendMessage(to, txt, {
    parse_mode: 'markdown'
  });

  txt = null;
}

// function sendImage(){
// 	telegram.sendPhoto(newsletterChatId, 'https://static1.squarespace.com/static/54fc8146e4b02a22841f4df7/59510970b6ac5081d70c82c1/59510a04e4fcb533d1d699e7/1498483206213/13246243_1005206202889430_7912208575068447048_o.jpg');
// }

function sendBarrelVideo(to) {
  telegram.sendVideo(to, {
    source: fs.createReadStream('data/z-barrel.m4v')
  });
}

function sendReminderVideo(){
  sendBarrelVideo(newsletterChatId);
  sendTo(newsletterChatId,"Ier verpassed öpis! Chömed au.");
}

// --------------------------------------------------------
// MAIN FUNCTION
// --------------------------------------------------------

function start() {
  initBot();
  update();
  setInterval(update, updateTime * 1000 * 60);
}

start();
