//function () { "use strict";

// shortcuts for easier to read formulas

var PI   = Math.PI,
    sin  = Math.sin,
    cos  = Math.cos,
    tan  = Math.tan,
    asin = Math.asin,
    atan = Math.atan2,
    acos = Math.acos,
    rad  = PI / 180;

// sun calculations are based on http://aa.quae.nl/en/reken/zonpositie.html formulas


// date/time constants and conversions

var dayMs = 1000 * 60 * 60 * 24,
    J1970 = 2440588,
    J2000 = 2451545;

function toJulian(date) {
    return date.valueOf() / dayMs - 0.5 + J1970;
}
function fromJulian(j) {
    return new Date((j + 0.5 - J1970) * dayMs);
}
function toDays(date) {
    return toJulian(date) - J2000;
}


// general calculations for position

var e = rad * 23.4397; // obliquity of the Earth

function getRightAscension(l, b) {
    return atan(sin(l) * cos(e) - tan(b) * sin(e), cos(l));
}
function getDeclination(l, b) {
    return asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l));
}
function getAzimuth(H, phi, dec) {
    return atan(sin(H), cos(H) * sin(phi) - tan(dec) * cos(phi));
}
function getAltitude(H, phi, dec) {
    return asin(sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(H));
}
function getSiderealTime(d, lw) {
    return rad * (280.16 + 360.9856235 * d) - lw;
}


// general sun calculations

function getSolarMeanAnomaly(d) {
    return rad * (357.5291 + 0.98560028 * d);
}
function getEquationOfCenter(M) {
    return rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M));
}
function getEclipticLongitude(M, C) {
    var P = rad * 102.9372; // perihelion of the Earth
    return M + C + P + PI;
}
function getSunCoords(d) {

    var M = getSolarMeanAnomaly(d),
        C = getEquationOfCenter(M),
        L = getEclipticLongitude(M, C);

    return {
        dec: getDeclination(L, 0),
        ra: getRightAscension(L, 0)
    };
}


var SunCalc = {};


// calculates sun position for a given date and latitude/longitude

SunCalc.getPosition = function (date, lat, lng) {

    var lw  = rad * -lng,
        phi = rad * lat,
        d   = toDays(date),

        c  = getSunCoords(d),
        H  = getSiderealTime(d, lw) - c.ra;

    return {
        azimuth: getAzimuth(H, phi, c.dec),
        altitude: getAltitude(H, phi, c.dec)
    };
};


// sun times configuration (angle, morning name, evening name)

var times = [
    [-0.83, 'sunrise',       'sunset'      ],
    [ -0.3, 'sunriseEnd',    'sunsetStart' ],
    [   -6, 'dawn',          'dusk'        ],
    [  -12, 'nauticalDawn',  'nauticalDusk'],
    [  -18, 'nightEnd',      'night'       ],
    [    6, 'goldenHourEnd', 'goldenHour'  ]
];

// adds a custom time to the times config

SunCalc.addTime = function (angle, riseName, setName) {
    times.push([angle, riseName, setName]);
};


// calculations for sun times

var J0 = 0.0009;

function getJulianCycle(d, lw) {
    return Math.round(d - J0 - lw / (2 * PI));
}
function getApproxTransit(Ht, lw, n) {
    return J0 + (Ht + lw) / (2 * PI) + n;
}
function getSolarTransitJ(ds, M, L) {
    return J2000 + ds + 0.0053 * sin(M) - 0.0069 * sin(2 * L);
}
function getHourAngle(h, phi, d) {
    return acos((sin(h) - sin(phi) * sin(d)) / (cos(phi) * cos(d)));
}


// calculates sun times for a given date and latitude/longitude

SunCalc.getTimes = function (date, lat, lng) {

    var lw  = rad * -lng,
        phi = rad * lat,
        d   = toDays(date),

        n  = getJulianCycle(d, lw),
        ds = getApproxTransit(0, lw, n),

        M = getSolarMeanAnomaly(ds),
        C = getEquationOfCenter(M),
        L = getEclipticLongitude(M, C),

        dec = getDeclination(L, 0),

        Jnoon = getSolarTransitJ(ds, M, L);


    // returns set time for the given sun altitude
    function getSetJ(h) {
        var w = getHourAngle(h, phi, dec),
            a = getApproxTransit(w, lw, n);

        return getSolarTransitJ(a, M, L);
    }


    var result = {
        solarNoon: fromJulian(Jnoon),
        nadir: fromJulian(Jnoon - 0.5)
    };

    var i, len, time, angle, morningName, eveningName, Jset, Jrise;

    for (i = 0, len = times.length; i < len; i += 1) {
        time = times[i];

        Jset = getSetJ(time[0] * rad);
        Jrise = Jnoon - (Jset - Jnoon);

        result[time[1]] = fromJulian(Jrise);
        result[time[2]] = fromJulian(Jset);
    }

    return result;
};


// moon calculations, based on http://aa.quae.nl/en/reken/hemelpositie.html formulas

function getMoonCoords(d) { // geocentric ecliptic coordinates of the moon

    var L = rad * (218.316 + 13.176396 * d), // ecliptic longitude
        M = rad * (134.963 + 13.064993 * d), // mean anomaly
        F = rad * (93.272 + 13.229350 * d),  // mean distance

        l  = L + rad * 6.289 * sin(M), // longitude
        b  = rad * 5.128 * sin(F),     // latitude
        dt = 385001 - 20905 * cos(M);  // distance to the moon in km

    return {
        ra: getRightAscension(l, b),
        dec: getDeclination(l, b),
        dist: dt
    };
}

SunCalc.getMoonPosition = function (date, lat, lng) {

    var lw  = rad * -lng,
        phi = rad * lat,
        d   = toDays(date),

        c = getMoonCoords(d),
        H = getSiderealTime(d, lw) - c.ra,
        h = getAltitude(H, phi, c.dec);

    // altitude correction for refraction
    h = h + rad * 0.017 / tan(h + rad * 10.26 / (h + rad * 5.10));

    return {
        azimuth: getAzimuth(H, phi, c.dec),
        altitude: h,
        distance: c.dist
    };
};


// calculations for illuminated fraction of the moon,
// based on http://idlastro.gsfc.nasa.gov/ftp/pro/astro/mphase.pro formulas

SunCalc.getMoonIllumination = function (date) {

    var d = toDays(date || new Date()),
        s = getSunCoords(d),
        m = getMoonCoords(d),

        sdist = 149598000, // distance from Earth to Sun in km

        phi = acos(sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra)),
        inc = atan(sdist * sin(phi), m.dist - sdist * cos(phi)),
        angle = atan(cos(s.dec) * sin(s.ra - m.ra), sin(s.dec) * cos(m.dec) -
                cos(s.dec) * sin(m.dec) * cos(s.ra - m.ra));

    return {
        fraction: (1 + cos(inc)) / 2,
        phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI,
        angle: angle
    };
};
var owm_WindToId = {
    '0': 0,
    '1': 0,
    '2': 0,
    '3': 0,
    '4': 0,
    '5': 0,
    '6': 0,
    '7': 0,
    '8': 0,
    '9': 0,
    '10': 0,
    '11': 0,
    '12': 0,
    '13': 0,
    '14': 0,
    '15': 0,
    '16': 0,
    '17': 0,
    '18': 0,
    '19': 0,
    '20': 0,
    '21': 0,
    '22': 0,
    '23': 2,
    '24': 2,
    '25': 2,
    '26': 2,
    '27': 2,
    '28': 2,
    '29': 2,
    '30': 2,
    '31': 2,
    '32': 2,
    '33': 2,
    '34': 2,
    '35': 2,
    '36': 2,
    '37': 2,
    '38': 2,
    '39': 2,
    '40': 2,
    '41': 2,
    '42': 2,
    '43': 2,
    '44': 2,
    '45': 2,
    '46': 2,
    '47': 2,
    '48': 2,
    '49': 2,
    '50': 2,
    '51': 2,
    '52': 2,
    '53': 2,
    '54': 2,
    '55': 2,
    '56': 2,
    '57': 2,
    '58': 2,
    '59': 2,
    '60': 2,
    '61': 2,
    '62': 2,
    '63': 2,
    '64': 2,
    '65': 2,
    '66': 2,
    '67': 2,
    '68': 4,
    '69': 4,
    '70': 4,
    '71': 4,
    '72': 4,
    '73': 4,
    '74': 4,
    '75': 4,
    '76': 4,
    '77': 4,
    '78': 4,
    '79': 4,
    '80': 4,
    '81': 4,
    '82': 4,
    '83': 4,
    '84': 4,
    '85': 4,
    '86': 4,
    '87': 4,
    '88': 4,
    '89': 4,
    '90': 4,
    '91': 4,
    '92': 4,
    '93': 4,
    '94': 4,
    '95': 4,
    '96': 4,
    '97': 4,
    '98': 4,
    '99': 4,
    '100': 4,
    '101': 4,
    '102': 4,
    '103': 4,
    '104': 4,
    '105': 4,
    '106': 4,
    '107': 4,
    '108': 4,
    '109': 4,
    '110': 4,
    '111': 4,
    '112': 4,
    '113': 6,
    '114': 6,
    '115': 6,
    '116': 6,
    '117': 6,
    '118': 6,
    '119': 6,
    '120': 6,
    '121': 6,
    '122': 6,
    '123': 6,
    '124': 6,
    '125': 6,
    '126': 6,
    '127': 6,
    '128': 6,
    '129': 6,
    '130': 6,
    '131': 6,
    '132': 6,
    '133': 6,
    '134': 6,
    '135': 6,
    '136': 6,
    '137': 6,
    '138': 6,
    '139': 6,
    '140': 6,
    '141': 6,
    '142': 6,
    '143': 6,
    '144': 6,
    '145': 6,
    '146': 6,
    '147': 6,
    '148': 6,
    '149': 6,
    '150': 6,
    '151': 6,
    '152': 6,
    '153': 6,
    '154': 6,
    '155': 6,
    '156': 6,
    '157': 6,
    '158': 8,
    '159': 8,
    '160': 8,
    '161': 8,
    '162': 8,
    '163': 8,
    '164': 8,
    '165': 8,
    '166': 8,
    '167': 8,
    '168': 8,
    '169': 8,
    '170': 8,
    '171': 8,
    '172': 8,
    '173': 8,
    '174': 8,
    '175': 8,
    '176': 8,
    '177': 8,
    '178': 8,
    '179': 8,
    '180': 8,
    '181': 8,
    '182': 8,
    '183': 8,
    '184': 8,
    '185': 8,
    '186': 8,
    '187': 8,
    '188': 8,
    '189': 8,
    '190': 8,
    '191': 8,
    '192': 8,
    '193': 8,
    '194': 8,
    '195': 8,
    '196': 8,
    '197': 8,
    '198': 8,
    '199': 8,
    '200': 8,
    '201': 8,
    '202': 8,
    '203': 10,
    '204': 10,
    '205': 10,
    '206': 10,
    '207': 10,
    '208': 10,
    '209': 10,
    '210': 10,
    '211': 10,
    '212': 10,
    '213': 10,
    '214': 10,
    '215': 10,
    '216': 10,
    '217': 10,
    '218': 10,
    '219': 10,
    '220': 10,
    '221': 10,
    '222': 10,
    '223': 10,
    '224': 10,
    '225': 10,
    '226': 10,
    '227': 10,
    '228': 10,
    '229': 10,
    '230': 10,
    '231': 10,
    '232': 10,
    '233': 10,
    '234': 10,
    '235': 10,
    '236': 10,
    '237': 10,
    '238': 10,
    '239': 10,
    '240': 10,
    '241': 10,
    '242': 10,
    '243': 10,
    '244': 10,
    '245': 10,
    '246': 10,
    '247': 10,
    '248': 12,
    '249': 12,
    '250': 12,
    '251': 12,
    '252': 12,
    '253': 12,
    '254': 12,
    '255': 12,
    '256': 12,
    '257': 12,
    '258': 12,
    '259': 12,
    '260': 12,
    '261': 12,
    '262': 12,
    '263': 12,
    '264': 12,
    '265': 12,
    '266': 12,
    '267': 12,
    '268': 12,
    '269': 12,
    '270': 12,
    '271': 12,
    '272': 12,
    '273': 12,
    '274': 12,
    '275': 12,
    '276': 12,
    '277': 12,
    '278': 12,
    '279': 12,
    '280': 12,
    '281': 12,
    '282': 12,
    '283': 12,
    '284': 12,
    '285': 12,
    '286': 12,
    '287': 12,
    '288': 12,
    '289': 12,
    '290': 12,
    '291': 12,
    '292': 12,
    '293': 14,
    '294': 14,
    '295': 14,
    '296': 14,
    '297': 14,
    '298': 14,
    '299': 14,
    '300': 14,
    '301': 14,
    '302': 14,
    '303': 14,
    '304': 14,
    '305': 14,
    '306': 14,
    '307': 14,
    '308': 14,
    '309': 14,
    '310': 14,
    '311': 14,
    '312': 14,
    '313': 14,
    '314': 14,
    '315': 14,
    '316': 14,
    '317': 14,
    '318': 14,
    '319': 14,
    '320': 14,
    '321': 14,
    '322': 14,
    '323': 14,
    '324': 14,
    '325': 14,
    '326': 14,
    '327': 14,
    '328': 14,
    '329': 14,
    '330': 14,
    '331': 14,
    '332': 14,
    '333': 14,
    '334': 14,
    '335': 14,
    '336': 14,
    '337': 14,
    '338': 0,
    '339': 0,
    '340': 0,
    '341': 0,
    '342': 0,
    '343': 0,
    '344': 0,
    '345': 0,
    '346': 0,
    '347': 0,
    '348': 0,
    '349': 0,
    '350': 0,
    '351': 0,
    '352': 0,
    '353': 0,
    '354': 0,
    '355': 0,
    '356': 0,
    '357': 0,
    '358': 0,
    '359': 0,
    '360': 0,

};
var owm_iconToId = {
    '01d': 1,
    '01d': 2,
    '02d': 3,
    '02d': 4,
    '02d': 5,
    '02d': 6,
    '03d': 7,
    '04d': 7,
    '09d': 8,
    '10d': 8,
    '13d': 9,
    '11d': 10,
    '50d': 13,
    '01n': 20,
    '01n': 21,
    '02n': 22,
    '02n': 23,
    '02n': 24,
    '02n': 25,
    '03n': 26,
    '04n': 26,
    '09n': 27,
    '10n': 27,
    '13n': 28,
    '11n': 29,
    '50n': 32,
};

//clear-day, clear-night, rain, snow, sleet, wind, fog, cloudy, partly-cloudy-day, or partly-cloudy-night, hail, thunderstorm, tornado//
var ds_iconToId = {
   'unknown': 0,
    'clear-day': 1,
    'sunny': 2,
    'partly-cloudy-day': 3,
    'day-cloudy':3,
    'cloudy': 7,
    'rain': 8,
    'snow': 9,
    'thunderstorm': 10,
    'sleet': 11,
    'clear-night': 20,
    'partly-cloudy-night': 22,
    'night-cloudy': 23,
    'fog': 38,
    'wind': 40,
    'strong-wind': 40,
    'hail': 41,
    'tornado': 42,
};

var Clay = require('pebble-clay');
var clayConfig = require('./config');
var clay = new Clay(clayConfig);

var xhrRequest = function (url, type, callback) {
  var xhr = new XMLHttpRequest();
  xhr.onload = function () {
    callback(this.responseText);
  };
  xhr.open(type, url);
  xhr.send();
};

function suncalcinfo (pos){
    //suncalc stuff

  var settings = JSON.parse(localStorage.getItem('clay-settings')) || {};
  var manuallat = settings.Lat;
  var manuallong = settings.Long;
  if(manuallat !== null && manuallat !== '' && manuallong !== null && manuallong !== '' ){
    var lat= manuallat;
    var lon= manuallong;
  }
  else {
    var lat=pos.coords.latitude;
    var lon= pos.coords.longitude;
  }
  //var lat=pos.coords.latitude;
  //var lon= pos.coords.longitude;
        var d = new Date();
        var sunTimes = SunCalc.getTimes(d, lat, lon);
        var sunsetraw = sunTimes.sunset.toTimeString().split(' ')[0];
        var sunriseraw = sunTimes.sunrise.toTimeString().split(' ')[0];
        var sunsetStrhr = ('0'+sunTimes.sunset.getHours()).substr(-2);
        var sunsetStrmin = ('0'+sunTimes.sunset.getMinutes()).substr(-2);
        var sunsetStr = String(sunsetStrhr + ":" + sunsetStrmin);
        var sunriseStrhr = ('0'+sunTimes.sunrise.getHours()).substr(-2);
        var sunriseStrmin = ('0'+sunTimes.sunrise.getMinutes()).substr(-2);
        var sunriseint = sunTimes.sunrise.getHours()*100+sunTimes.sunrise.getMinutes();
        var sunsetint = sunTimes.sunset.getHours()*100+sunTimes.sunset.getMinutes();
        //var sunsetint= String((sunsetStrhr*1) + sunsetStrmin);
        //var sunriseint= String((sunriseStrhr*1) + sunriseStrmin);
        var sunriseStr = String(sunriseStrhr + ":" + sunriseStrmin);
        var sunsetStrhr12 = parseInt(sunTimes.sunset.getHours());
        var sunriseStrhr12 = parseInt(sunTimes.sunrise.getHours());
        if(sunsetStrhr12 > 12 ){
          var sunsetStr12h = String (sunsetStrhr12 - 12 + ":" + sunsetStrmin);// +"pm");
          }
        else{
          var sunsetStr12h = String (sunsetStrhr12  + ":" + sunsetStrmin);// + "am");
          }
        if(sunriseStrhr > 12 ){
          var sunriseStr12h = String(sunriseStrhr12 - 12 + ":" + sunriseStrmin);// +"pm");
          }
        else{
          var sunriseStr12h = String(sunriseStrhr12  + ":" + sunriseStrmin);// + "am");
          }

        var moonmetrics = SunCalc.getMoonIllumination(d);
        var moonphase = Math.round(moonmetrics.phase*28);
   localStorage.setItem("OKAPI", 1);
    console.log("OK API");
    console.log(moonphase);
    console.log(d);
    console.log(lat);
    console.log(lon);
    console.log(sunsetStr);
    console.log(sunriseStr);
    console.log(sunriseint);
    console.log(sunsetint);
//    console.log(rightlefts);
    // Assemble dictionary
    var dictionary = {
      "HourSunrise":sunriseint,
      "HourSunset":sunsetint,
      "WEATHER_SUNSET_KEY":sunsetStr,
      "WEATHER_SUNRISE_KEY":sunriseStr,
      "WEATHER_SUNSET_KEY_12H":sunsetStr12h,
      "WEATHER_SUNRISE_KEY_12H":sunriseStr12h,
      "MoonPhase": moonphase,
    };
    // Send to Pebble
    Pebble.sendAppMessage(dictionary,function(e) {console.log("Suncalc stuff sent to Pebble successfully!");},
                                     function(e) {console.log("Error sending suncalc stuff to Pebble!");}
                                    );
  }

// Request for DarkSky
// Request for DarkSky
function locationSuccessDS(pos){
  //Request DarkSky
//  var lat=pos.coords.latitude;
//  var lon= pos.coords.longitude;
  var settings2 = JSON.parse(localStorage.getItem('clay-settings')) || {};
  var manuallat = settings2.Lat;
  var manuallong = settings2.Long;
  if(manuallat != null && manuallat != '' && manuallong != null && manuallong != '' ){
    var lat= manuallat;
    var lon= manuallong;
  }
  else {
    var lat=pos.coords.latitude;
    var lon= pos.coords.longitude;
  }
        var d = new Date();
        var sunTimes = SunCalc.getTimes(d, lat, lon);
        var sunsetStrhr = ('0'+sunTimes.sunset.getHours()).substr(-2);
        var sunsetStrmin = ('0'+sunTimes.sunset.getMinutes()).substr(-2);
        var sunsetStr = String(sunsetStrhr + ":" + sunsetStrmin);
        var sunriseStrhr = ('0'+sunTimes.sunrise.getHours()).substr(-2);
        var sunriseStrmin = ('0'+sunTimes.sunrise.getMinutes()).substr(-2);
        var sunriseStr = String(sunriseStrhr + ":" + sunriseStrmin);
        var sunsetStrhr12 = parseInt(sunTimes.sunset.getHours());
        var sunriseStrhr12 = parseInt(sunTimes.sunrise.getHours());
        if(sunsetStrhr12 > 12 ){
          var sunsetStr12h = String (sunsetStrhr12 - 12 + ":" + sunsetStrmin);// +"pm");
          }
        else{
          var sunsetStr12h = String (sunsetStrhr12  + ":" + sunsetStrmin);// + "am");
          }
        if(sunriseStrhr > 12 ){
          var sunriseStr12h = String(sunriseStrhr12 - 12 + ":" + sunriseStrmin);// +"pm");
          }
        else{
          var sunriseStr12h = String(sunriseStrhr12  + ":" + sunriseStrmin);// + "am");
          }
     var moonmetrics = SunCalc.getMoonIllumination(d);
     var moonphase = Math.round(moonmetrics.phase*28);
  var keyAPIds=localStorage.getItem('dsKey');
  var userKeyApi=settings2.APIKEY_User;
  var endapikey=apikeytouse(userKeyApi,keyAPIds);
  var units = unitsToString(settings2.WeatherUnit);
//  var unitsOWM=unitsToStringOWM(settings.WeatherUnit);
  var windunits = windunitsToString(settings2.WindUnit);
  var langtouse=translate(navigator.language);
  // Construct URL
  var urlDS = "https://api.darksky.net/forecast/" +
          endapikey +
         '/' + lat + ',' + lon +
         '?exclude=minutely,hourly&units=si' +
         '&lang=' + langtouse;


  console.log("DSUrl= " + urlDS);
  // Send request to DarkSky
  xhrRequest(encodeURI(urlDS), 'GET',function(responseText) {
    // responseText contains a JSON object with current weather info
    var json = JSON.parse(responseText);
    localStorage.setItem("OKAPI", 0);
    // Current Temperature
    var tempf = Math.round((json.currently.temperature * 1.8) + 32);//+'\xB0'+units;
    var tempc = Math.round(json.currently.temperature);
    var tempds=String(temptousewu(units,tempf,tempc))+'\xB0';
    // Current conditions
    var condds=json.currently.summary;//description;
    var condcleands=replaceDiacritics(condds);
    var icon_ds = ds_iconToId[json.currently.icon];
    // Sunrise and Sunset
    var auxsunds =new Date(json.daily.data[0].sunriseTime*1000);
    var sunriseds=auxsunds.getHours()*100+auxsunds.getMinutes();
    var auxsetds =new Date(json.daily.data[0].sunsetTime*1000);
    var sunsetds=auxsetds.getHours()*100+auxsetds.getMinutes();
    //current wind
    var windkts = Math.round(json.currently.windSpeed * 1.9438444924574);
    var windkph = Math.round(json.currently.windSpeed * 3.6);
    var windms = Math.round(json.currently.windSpeed);
    var windmph = Math.round(json.currently.windSpeed * 2.2369362920544);
    var wind = String(windtousewu(windunits,windkph,windmph,windms,windkts))+windunits;
    var winddegds = String(json.currently.windBearing);
    var winddir_numds = owm_WindToId[winddegds];
    // Forecast Conditions
    var forecast_icon_ds = ds_iconToId[json.daily.data[0].icon];
    // Forecast Temperature & wind
                  var forecast_high_tempf = Math.round((json.daily.data[0].temperatureHigh * 1.8) + 32);       //+'\xB0';
                  var forecast_low_tempf = Math.round((json.daily.data[0].temperatureLow * 1.8) + 32);        //+'\xB0';
                  var forecast_high_tempc = Math.round(json.daily.data[0].temperatureHigh);              //+ '\xB0';
                  var forecast_low_tempc = Math.round(json.daily.data[0].temperatureLow);              //+ '\xB0';
                  var highds = String(temptousewu(units,forecast_high_tempf,forecast_high_tempc));
                  var lowds = String(temptousewu(units,forecast_low_tempf,forecast_low_tempc));
                  var highlowds = highds + '|'+ lowds;//+'\xB0';
                  var forecast_ave_wind_mph = Math.round(json.daily.data[0].windSpeed*2.2369362920544);
                  var forecast_ave_wind_kts = Math.round(json.daily.data[0].windSpeed *1.9438444924574);
                  var forecast_ave_wind_kph = Math.round(json.daily.data[0].windSpeed *3.6);
                  var forecast_ave_wind_ms = Math.round(json.daily.data[0].windSpeed);
                  var forecast_wind_degds = String(json.daily.data[0].windBearing);
                  var forecast_wind_dir_numds = owm_WindToId[forecast_wind_degds];
                  var forecast_ave_wind_ds = String(windtousewu(windunits,forecast_ave_wind_kph,forecast_ave_wind_mph,forecast_ave_wind_ms,forecast_ave_wind_kts))+windunits;
                  var auxtimeds =new Date(json.currently.time*1000);
                  var dstime=auxtimeds.getHours()*100+auxtimeds.getMinutes();

                  localStorage.setItem("OKAPI", 1);
                  console.log("OK API");

                  console.log(condcleands);
                  console.log(sunsetds);
                  console.log(sunriseds);
                  console.log(wind);
                  console.log(winddir_numds);
                  console.log(tempds);
                  console.log(icon_ds);
                  console.log(highds);
                  console.log(forecast_icon_ds);
                  console.log(lowds);
                  console.log(forecast_wind_dir_numds);
                  console.log(forecast_ave_wind_ds);
                  console.log(sunsetStr);
                  console.log(sunriseStr);
                  console.log(moonphase);
                  console.log(winddegds);
                  console.log(forecast_wind_degds);
                  console.log(dstime);

    // Assemble dictionary using our keys
    var dictionary = {
      "WeatherTemp": tempds,
      "WeatherCond": condcleands,
      "HourSunset": sunsetds,
      "HourSunrise":sunriseds,
      "WeatherWind" : wind,
      "WEATHER_SUNSET_KEY":sunsetStr,
      "WEATHER_SUNRISE_KEY":sunriseStr,
      "WEATHER_SUNSET_KEY_12H":sunsetStr12h,
      "WEATHER_SUNRISE_KEY_12H":sunriseStr12h,
      "IconNow":icon_ds,
      "IconFore":forecast_icon_ds,
      "TempFore": highlowds,//hi_low,
      "TempForeLow": lowds,
      "WindFore": forecast_ave_wind_ds,
      "WindIconNow":winddir_numds,
      "WindIconAve":forecast_wind_dir_numds,
      "Weathertime":dstime,
      "MoonPhase": moonphase,

    };
    // Send to Pebble
    Pebble.sendAppMessage(dictionary,
                          function(e) {console.log("Weather from DS sent to Pebble successfully!");},
                          function(e) { console.log("Error sending DS info to Pebble!");}
                         );
      });
}

// Request for OWM
function locationSuccessOWM(pos){
  //Request OWM
//  var lat=pos.coords.latitude;
//  var lon= pos.coords.longitude;
  var settings3 = JSON.parse(localStorage.getItem('clay-settings')) || {};
  var manuallat = settings3.Lat;
  var manuallong = settings3.Long;
  if(manuallat != null && manuallat != '' && manuallong != null && manuallong != '' ){
    var lat= manuallat;
    var lon= manuallong;
  }
  else {
    var lat=pos.coords.latitude;
    var lon= pos.coords.longitude;
  }
        var d = new Date();
        var sunTimes = SunCalc.getTimes(d, lat, lon);
        var sunsetStrhr = ('0'+sunTimes.sunset.getHours()).substr(-2);
        var sunsetStrmin = ('0'+sunTimes.sunset.getMinutes()).substr(-2);
        var sunsetStr = String(sunsetStrhr + ":" + sunsetStrmin);
        var sunriseStrhr = ('0'+sunTimes.sunrise.getHours()).substr(-2);
        var sunriseStrmin = ('0'+sunTimes.sunrise.getMinutes()).substr(-2);
        var sunriseStr = String(sunriseStrhr + ":" + sunriseStrmin);
        var sunsetStrhr12 = parseInt(sunTimes.sunset.getHours());
        var sunriseStrhr12 = parseInt(sunTimes.sunrise.getHours());
        if(sunsetStrhr12 > 12 ){
          var sunsetStr12h = String (sunsetStrhr12 - 12 + ":" + sunsetStrmin);// +"pm");
          }
        else{
          var sunsetStr12h = String (sunsetStrhr12  + ":" + sunsetStrmin);// + "am");
          }
        if(sunriseStrhr > 12 ){
          var sunriseStr12h = String(sunriseStrhr12 - 12 + ":" + sunriseStrmin);// +"pm");
          }
        else{
          var sunriseStr12h = String(sunriseStrhr12  + ":" + sunriseStrmin);// + "am");
          }
     var moonmetrics = SunCalc.getMoonIllumination(d);
     var moonphase = Math.round(moonmetrics.phase*28);
  var keyAPIowm=localStorage.getItem('owmKey');
  var userKeyApi=settings3.APIKEY_User;
  var endapikey=apikeytouse(userKeyApi,keyAPIowm);
  var units = unitsToString(settings3.WeatherUnit);
 // var unitsOWM=unitsToStringOWM(settings3.WeatherUnit);
  var windunits = windunitsToString(settings3.WindUnit);
  var langtouse=translate(navigator.language);
  // Construct URL
  var urlOWM = "http://api.openweathermap.org/data/2.5/onecall?lat=" +
      lat + "&lon=" + lon +
      '&appid=' + endapikey + "&exclude=minutely,hourly,alerts" +
  //    '&units='+unitsOWM+
      '&lang='+langtouse;

  console.log("OWMUrl= " + urlOWM);
  // Send request to OpenWeatherMap
  xhrRequest(encodeURI(urlOWM), 'GET',function(responseText) {
    // responseText contains a JSON object with current weather info
    var json = JSON.parse(responseText);
    localStorage.setItem("OKAPI", 0);
    // Temperature
    var tempf = Math.round((json.current.temp * 1.8) - 459.67);//+'\xB0'+units;
    var tempc = Math.round(json.current.temp -273.15);
    var tempowm=String(temptousewu(units,tempf,tempc))+'\xB0';
    // Conditions
    var condowm=json.current.weather[0].main;//description;
    var condclean=replaceDiacritics(condowm);
    var icon_owm = owm_iconToId[json.current.weather[0].icon];
    // Sunrise and Sunset
    var auxsunowm =new Date(json.current.sunrise*1000);
    var sunriseowm=auxsunowm.getHours()*100+auxsunowm.getMinutes();
    var auxsetowm =new Date(json.current.sunset*1000);
    var sunsetowm=auxsetowm.getHours()*100+auxsetowm.getMinutes();
//current conditions
    var windkts = Math.round(json.current.wind_speed * 1.9438444924574);
    var windkph = Math.round(json.current.wind_speed * 3.6);
    var windms = Math.round(json.current.wind_speed);
    var windmph = Math.round(json.current.wind_speed * 2.2369362920544);
    var wind = String(windtousewu(windunits,windkph,windmph,windms,windkts))+windunits;
    var winddeg = String(json.current.wind_deg);
    var winddir_num = owm_WindToId[winddeg];
//forecast
    var forecast_icon_owm = owm_iconToId[json.daily[0].weather[0].icon];
    var forecast_high_tempf = Math.round((json.daily[0].temp.max* 1.8) - 459.67);       //+'\xB0';
    var forecast_low_tempf = Math.round((json.daily[0].temp.min* 1.8) - 459.67);        //+'\xB0';
    var forecast_high_tempc = Math.round(json.daily[0].temp.max - 273.15);              //+ '\xB0';
    var forecast_low_tempc = Math.round(json.daily[0].temp.min - 273.15);              //+ '\xB0';
    var highowm = String(temptousewu(units,forecast_high_tempf,forecast_high_tempc));
    var lowowm = String(temptousewu(units,forecast_low_tempf,forecast_low_tempc));
    var highlowowm = highowm + '|'+ lowowm;//+'\xB0';
    var forecast_ave_wind_mph = Math.round(json.daily[0].wind_speed*2.2369362920544);
    var forecast_ave_wind_kts = Math.round(json.daily[0].wind_speed *1.9438444924574);
    var forecast_ave_wind_kph = Math.round(json.daily[0].wind_speed *3.6);
    var forecast_ave_wind_ms = Math.round(json.daily[0].wind_speed);
    var forecast_wind_deg = String(json.daily[0].wind_deg);
    var forecast_wind_dir_num = owm_WindToId[forecast_wind_deg];
    var forecast_ave_wind_owm = String(windtousewu(windunits,forecast_ave_wind_kph,forecast_ave_wind_mph,forecast_ave_wind_ms,forecast_ave_wind_kts))+windunits;
    var auxtimeowm =new Date(json.current.dt*1000);
    var owmtime =auxtimeowm.getHours()*100+auxtimeowm.getMinutes();


    console.log(condclean);
    console.log(sunsetowm);
    console.log(sunriseowm);
    console.log(wind);
    console.log(winddir_num);
    console.log(tempowm);
    console.log(icon_owm);
    console.log(highowm);
    console.log(forecast_icon_owm);
    console.log(lowowm);
    console.log(highlowowm);
    console.log(forecast_wind_dir_num);
    console.log(forecast_ave_wind_owm);
    console.log(sunsetStr);
    console.log(sunriseStr);
    console.log(moonphase);
    console.log(winddeg);
    console.log(forecast_wind_deg);
    console.log(owmtime);

   // var wind = String(windkts + "kts");
    localStorage.setItem("OKAPI", 1);
    console.log("OK API");

  //    xhrRequest(encodeURI(urlForecast), 'GET',function(forecastresponseText) {
      // forecastresponseText contains a JSON object with forecast weather info
  //    var jsonf = JSON.parse(forecastresponseText);
  //    localStorage.setItem("OKAPIForecast", 0);
        // Forecast Conditions
    //              var condowm=jsonf.weather[0].main;//description;


    // Assemble dictionary using our keys
    var dictionary = {
      "WeatherTemp": tempowm,
      "WeatherCond": condclean,
      "HourSunset": sunsetowm,
      "HourSunrise":sunriseowm,
      "WeatherWind" : wind,
      "WEATHER_SUNSET_KEY":sunsetStr,
      "WEATHER_SUNRISE_KEY":sunriseStr,
      "WEATHER_SUNSET_KEY_12H":sunsetStr12h,
      "WEATHER_SUNRISE_KEY_12H":sunriseStr12h,
      "IconNow":icon_owm,
      "IconFore":forecast_icon_owm,
      "TempFore": highlowowm,//hi_low,
      "TempForeLow": lowowm,
      "WindFore": forecast_ave_wind_owm,
      "WindIconNow":winddir_num,
      "WindIconAve":forecast_wind_dir_num,
      "Weathertime":owmtime,
      "MoonPhase": moonphase,

    };
    // Send to Pebble
    Pebble.sendAppMessage(dictionary,
                          function(e) {console.log("Weather from OWM sent to Pebble successfully!");},
                          function(e) { console.log("Error sending OWM info to Pebble!");}
                         );
  //    });
  });
}


function locationError(err) {
  console.log("Error requesting geolocation!");
  //Send response null
  var location="";
  // Assemble dictionary using our keys
  var dictionary = {
    "NameLocation": location};
  Pebble.sendAppMessage(dictionary,
                        function(e) {
                          console.log("Null key sent to Pebble successfully!");
                        },
                        function(e) {
                          console.log("Null key error sending to Pebble!");
                        }
                       );
}

function getinfo() {
  // Get keys from pmkey
  var settings4 = JSON.parse(localStorage.getItem('clay-settings')) || {};
  var manuallat = settings4.Lat;
  var manuallong = settings4.Long;
  var email=settings4.EmailPMKEY;
  var pin=settings4.PINPMKEY;
  if (email !== undefined && pin !== undefined) {
    //Request API from pmkey.xyz
    var urlpmk='https://pmkey.xyz/search/?email='+email+"&pin="+pin;
    console.log("Url PMKEY is "+ urlpmk);
    var keys = parseInt(localStorage.getItem("OKAPI"));
    console.log("Flag keys is " + keys);
    if (keys===0){
      xhrRequest(encodeURI(urlpmk),'GET',
                 function(responseText){
                   var jsonpmk=JSON.parse(responseText);
                   var owmKey=jsonpmk.keys.weather.owm;
                   var dsKey=jsonpmk.keys.weather.forecast;
                   localStorage.setItem("owmKey", owmKey);
                   localStorage.setItem("dsKey", dsKey);
                 }
                );
    }
  }
  var weatherprov=settings4.WeatherProv;

  if (weatherprov=="owm"){
    console.log("Ready from OWM");
    if(manuallat != null && manuallat != '' && manuallong != null && manuallong != '' ){
      console.log(manuallat);
      console.log(manuallong);
      suncalcinfo();
      locationSuccessOWM();
    }
    else {
    navigator.geolocation.getCurrentPosition(
      suncalcinfo,
      locationError,
      {enableHighAccuracy:true,timeout: 15000, maximumAge: 1000}
    );
    navigator.geolocation.getCurrentPosition(
      locationSuccessOWM,
      locationError,
      {enableHighAccuracy:true,timeout: 15000, maximumAge: 1000}
    );
    }
  }
  else
    {
    console.log("Ready from DS");
    if(manuallat != null && manuallat != '' && manuallong != null && manuallong != '' ){
      console.log(manuallat);
      console.log(manuallong);
      suncalcinfo();
      locationSuccessDS();
      }
    else {
      navigator.geolocation.getCurrentPosition(
      suncalcinfo,
      locationError,
      {enableHighAccuracy:true,timeout: 15000, maximumAge: 1000}
    );
      navigator.geolocation.getCurrentPosition(
      locationSuccessDS,
      locationError,
      {enableHighAccuracy:true,timeout: 15000, maximumAge: 1000}
    );
    }
    }
  }


// Listen for when the watchface is opened
Pebble.addEventListener('ready',
                        function(e) {
                          console.log("Starting Watchface!");
                          localStorage.setItem("OKAPI", 0);
                          //get suncalc
                          //suncalcinfo();
                          // Get the initial weather
                          getinfo();
                        }
                       );
// Listen for when an AppMessage is received
Pebble.addEventListener('appmessage',
                        function(e) {
                          console.log("Requesting geoposition!");
                        //  suncalcinfo();
                          getinfo();
                        }
                       );
// Listen for when the Config app changes
Pebble.addEventListener('webviewclosed',
                        function(e) {
                          console.log("Updating config!");
                          //suncalcinfo();
                          getinfo();
                        }
                       );

function unitsToString(unit) {
 if (unit) {
   return 'F';
 }
 return 'C';
}
function windunitsToString(windunit){
 if (windunit=='kts') {
   return 'kt';
 }
 else if (windunit=='kph'){
   return 'kph';
 }
 else if (windunit=='ms'){
   return 'ms';
 }
 return 'mph';
 }
//functions and mappings
/*function unitsToStringOWM(unit) {
  if (unit) {
    return 'imperial';
  }
  return 'metric';
}*/


/*function rotation(rightleft) {
  if (rightleft) {
    return 'false';
  }
  return 'true';
}*/

function translate(langloc){
  if (langloc==='es-ES'){
    return 'es';
  }
  else if (langloc==='fr_FR'){
    return 'fr';
  }
  else if (langloc==='de_DE'){
    return 'de';
  }
  else if (langloc==='it_IT'){
    return 'it';
  }
  else if (langloc==='pt_PT'){
    return 'pt';
  }
  else {
    return 'en';
  }
}
function translatewu(langloc){
  if (langloc==='es-ES'){
    return 'SP';
  }
  else if (langloc==='fr_FR'){
    return 'FR';
  }
  else if (langloc==='de_DE'){
    return 'DL';
  }
  else if (langloc==='it_IT'){
    return 'IT';
  }
  else if (langloc==='pt_PT'){
    return 'BR';
  }
  else {
    return 'EN';
  }
}

function temptousewu(unit,tempf,tempc){
  if (unit=="F"){
    return tempf; }
  else return tempc;
}
function windtousewu(windunit,windkph,windmph,windms,windkts){
  if (windunit=="kph"){
    return windkph; }
  else if (windunit=="mph")
    {return windmph; }
  else if (windunit=="ms")
    {return windms; }
  else return windkts;
}
function replaceDiacritics(s){
    var diacritics =[
        /[\300-\306]/g, /[\340-\346]/g,  // A, a
        /[\310-\313]/g, /[\350-\353]/g,  // E, e
        /[\314-\317]/g, /[\354-\357]/g,  // I, i
        /[\322-\330]/g, /[\362-\370]/g,  // O, o
        /[\331-\334]/g, /[\371-\374]/g,  // U, u
        /[\321]/g, /[\361]/g, // N, n
        /[\307]/g, /[\347]/g, // C, c
    ];

    var chars = ['A','a','E','e','I','i','O','o','U','u','N','n','C','c'];

    for (var i = 0; i < diacritics.length; i++)
    {
        s = s.replace(diacritics[i],chars[i]);
    }
  var end=s;
  return end;
}
function apikeytouse(APIUser,APIPMKEY){
  if (APIUser===""){
    console.log("Using pmkey");
    return APIPMKEY;
  }
  else {
    console.log("Using Key User");
    return APIUser;
  }
}
