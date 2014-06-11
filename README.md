TheDayAhead
===========

TheDayAhead is a Google Apps Script that summarizes your upcoming day's events, events that you have not responded to, along with a set of news feeds that you regularly read, and delivers that summary to your inbox automatically.

## Summary
The `deliverNews()` function in the script is the main entry point. This script compiles information from the day's calendar and reads a predefined set of RSS feeds. You can also supply a list of keywords that the script will scan the feed headlines for and use to build a Top Stories list.

> *Note*: to use the script you must enable the Calendar API in both your Apps Script IDE and in the Google Developer console. There is a link to the developer console in the dialog that enables the Calendar API  in the Apps Script editor. Select Resources -> Advanced Services, then enable Calendar.

## APIs Used
* UrlFetchApp
* XmlService
* GmailApp
* Calendar


