/*******
** TheDayAhead Google Apps Script
**
** Crawls a list of given RSS feeds and returns a set of headlines, which 
** are sent via Gmail to the given email address along with information from
** the user's calendar on events for the day and events that have not been
** responded to yet.
**
** NOTE: This uses the Advanced Calendar service, which must be enabled in both
** your script's resources AND in the Google Developer Console.
*/

// data feed URLs
var dataSources = [
  "http://gigaom.com/feed/",
  "http://feeds.reuters.com/reuters/technologyNews?format=xml",
  "http://www.engadget.com/rss-hd.xml",
  "http://feeds2.feedburner.com/thenextweb",
  "http://feeds.arstechnica.com/arstechnica/index?format=xml",
  "http://www.forbes.com/technology/feed/",
  "http://www.pcworld.com/index.rss",
  "http://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
  "http://recode.net/feed/"
];
// keyword triggers
var keyWords = [
  "chrome", "chromebook", "chromeos", "google", "android", "gmail", "cloud", "app engine", 
  "appengine", "compute engine", "microsoft", "facebook", "apple", "windows phone", "windows 8"
];

// List to hold headlines that contain keywords
var topStories = [];

// Settings
var HEADLINE_LIMIT = 15;                    // Number of headlines per news source
var EMAIL_TITLE = "Top News And Events";    // What to title the email
var DAYS_AHEAD = 7;                         // Number of days out to scan events

/*******
** deliverNews
**
** Generates a summary of daily news items, tasks, and calendar information
** and delivers it to the user's inbox in one complete email message
*/
function deliverNews()
{
  var newsMsg = ""; // will hold the completed HTML to email
  var deliverAddress = Session.getActiveUser().getEmail();
  
  var calEventsStr = "<h2>Calendar: ";

  // get a list of today's events
  var calEvents = getEventsForToday();
  if (calEvents.length > 0) {
    calEventsStr += calEvents.length + " Events</h2>";
    calEventsStr += buildEventsHTML(calEvents);
  }
  else {
    calEventsStr += "0 Events</h2>";
  }
  
  // Get upcoming calendar events that have not been responded to
  calEvents = getEventsMissingResponse();
  if (calEvents.length > 0) {
    calEventsStr += "<p>You have " + calEvents.length + " events in the next " + 
      DAYS_AHEAD + " days that you have not RSVP'd to:</p>";

    calEventsStr += buildEventsHTML(calEvents);
  }
  
  // Collect the headlines from the feeds and filter the top stories
  var feedStoriesStr = "";
  for (var i=0; i < dataSources.length; i++) {
    feedStoriesStr += retrieveFeedItems(dataSources[i]);
  }
  
  // Generate the Top Stories list that was created based on keywords
  var topStoriesStr = "<h2>Top Stories</h2>";
  if (topStories.length > 0) {
    topStoriesStr += "<ul>";
    for (var k=0; k<topStories.length; k++) {
      topStoriesStr += "<li style='font-weight:bold'><a href='" + topStories[k].link + "'>" + 
        topStories[k].title + "</a></li>\n";
    }
    topStoriesStr += "</ul>";
  }

  // put all the data together
  newsMsg = "<h1>" + EMAIL_TITLE + "</h1>\n" + calEventsStr + topStoriesStr + feedStoriesStr;
  
  // Deliver the email message as HTML to the recipient
  GmailApp.sendEmail(deliverAddress, EMAIL_TITLE, "", { htmlBody: newsMsg });
  Logger.log(newsMsg.length);
}

/*******
** retrieveFeedItems
**
** returns a formatted HTML list for the given URL data feed
**
** @param {URL} feedUrl the URL of the feed to process
** @returns {string} Formatted HTML of the feed headlines
*/
function retrieveFeedItems(feedUrl) {
  var feedSrc = null;
  var feedDoc = null;
  var str = "";
  var itemCount = 0;
  var root = null;
  var type = "unknown";
  
  // to avoid having one bad XML feed take down the entire script,
  // wrap the parsing in a try-catch block
  try {
    feedSrc = UrlFetchApp.fetch(feedUrl).getContentText();
    feedDoc = XmlService.parse(feedSrc);
    if (feedDoc)
      root = feedDoc.getRootElement();
  }
  catch (e) {
    Logger.log("Error reading feed: " + feedUrl);
    Logger.log(e);
  }
  
  // detect the kind of feed this is. Right now only handles RSS 2.0
  // but adding other formats would be easy enough
  if (root && root.getName() == "rss") {
    var version = root.getAttribute("version").getValue();
    if (version == "2.0")
      type = "rss2";
  }
  
  if (type == "rss2") {
    str += "<div>";
    var channel = root.getChild("channel");
    var items = channel.getChildren("item");
    str += "<h2><a href='"+channel.getChildText("link")+"'>"+channel.getChildText("title")+"</a></h2>\n";
    Logger.log("%s items from %s", items.length, channel.getChildText("title"));

    // Limit the number of headlines
    itemCount = (items.length > HEADLINE_LIMIT ? HEADLINE_LIMIT : items.length);
    str += "<ul>";
    for (var i=0; i < itemCount; i++) {
      var keywordFound = false;
      var strTitle = items[i].getChildText("title");
      var strLink = items[i].getChildText("link");
      
      // If the title triggers a keyword, add it to the topStories list
      for (var j=0; j < keyWords.length; j++) {
        // simple index search, could be vastly improved
        if ( strTitle.toLowerCase().indexOf(keyWords[j]) != -1) {
          topStories.push( {title: strTitle, link: strLink} );
          keywordFound=true;
          break;
        }
      }
      // If we didn't add this item to the topStories, add it to the main news
      if (!keywordFound) {
        str += "<li><a href='" + strLink + "'>" + strTitle + "</a></li>\n";
      }
      Logger.log(strTitle);
    }
    str += "</ul></div>\n";
  }
  
  return str;
}

/*******
** getMissingResponseEvents
**
** Get a list of Calendar events that have not been responded to.
**
** @returns {CalendarEvent []} array of CalendarEvent objects
*/
function getEventsMissingResponse() {
  var d = new Date();
  var now = d.toISOString();
  var then = new Date(d.getTime() + (1000 * 60 * 60 * 24 * DAYS_AHEAD)).toISOString();
  var events = [];
  var returnEvents = [];
  
  // Find future events that have not been responded to yet
  events = Calendar.Events.list("primary", {singleEvents: true, timeMin: now, timeMax: then});
  for (var i=0; i < events.items.length; i++) {
    var attendees = events.items[i].attendees;
    if (attendees) {
      for (var j=0; j<attendees.length; j++) {
        if (attendees[j].email && attendees[j].email == Session.getActiveUser().getEmail()) {
          if (attendees[j].responseStatus == "needsAction") {
            returnEvents.push(events.items[i]);
            break;
          }
        }
      }
    }
  }
  
  Logger.log("%s Calendar events with no RSVP",events.length);
  return returnEvents;
}

/*******
** getEventsForToday
**
** retrieves the Calendar events for today. 
**
** @returns {Event []} list of Calendar Events
*/
function getEventsForToday() {
  var returnEvents = [];
  var calendars, pageToken;
  
  // set the lower bound at midnight
  var today1 = new Date();
  today1.setHours(0,0,0);
  
  // set the upper bound at 23:59:59
  var today2 = new Date();
  today2.setHours(23, 59, 59);
  
  // Create ISO strings to pass to Calendar API
  var ds1 = today1.toISOString();
  var ds2 = today2.toISOString();

  // loop through all Calendars to get events
  do {
    calendars = Calendar.CalendarList.list({
      maxResults: 100,
      pageToken: pageToken
    });
    if (calendars.items && calendars.items.length > 0) {
      for (var i = 0; i < calendars.items.length; i++) {
        var calendar = calendars.items[i];
        var tempResult = Calendar.Events.list(calendar.id, {singleEvents: true, timeMin: ds1, timeMax: ds2});
        returnEvents = returnEvents.concat(tempResult.items);
      }
    } 
    else {
      Logger.log('No calendars found.');
    }
    pageToken = calendars.nextPageToken;
  } while (pageToken);
  
  // Get the events
  return returnEvents;
}

/*******
** buildEventsHTML
**
** given a set of calendar events, build an HTML list. 
**
** @returns {string} string of HTML representing the events
*/
function buildEventsHTML(calEvents) {
  var str="";

  str += "<ul>";    
  for (var i=0; i < calEvents.length; i++) {
    // Gotcha! All-day events don't have a dateTime, just a date, so need to check
    var dateStr = convertDate(calEvents[i].start.dateTime ? 
                              calEvents[i].start.dateTime : 
                              calEvents[i].start.date).toLocaleString();
    str += "<li><a href='" + calEvents[i].htmlLink + "'>" + 
      calEvents[i].summary + "</a> " + dateStr + "</li>";
  }
  str += "</ul>";
  
  return str;
}

/*******
** convertDate
**
** Converts an ISO Date string into a JavaScript Date Object.
**
** @param {string} t The date string to parse. Can be either a full datetime or just a date
** @returns {Date} newly constructed Date object
*/
function convertDate(tStr) {
  var dateTimeRE = /(\d+)-(\d+)-(\d+)T(\d+):(\d+):(\d+)([+\-]\d+):(\d+)/;
  var dateRE = /(\d+)-(\d+)-(\d+)/;
  var match = tStr.match(dateTimeRE);
  if (!match) 
    match = tStr.match(dateRE);
  
  var nums = [];
  if (match) {
    for (var i = 1; i < match.length; i++) {
      nums.push(parseInt(match[i], 10));
    }
    if (match.length > 4) {
      // YYYY-MM-DDTHH:MM:SS
      return(new Date(nums[0], nums[1] - 1, nums[2], nums[3], nums[4], nums[5]));
    }
    else {
      // YYYY-MM-DD
      return(new Date(nums[0], nums[1] - 1, nums[2]));
    }
  }
  else return null;
}
