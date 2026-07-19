/*
  MotoXsyndicate Live settings
  Edit this file in Notepad, save it, then commit and push to GitHub.

  status options: "offline", "starting", "live", "intermission", "ended"
  youtubeVideoId is the characters after v= in a YouTube URL.
  Example: https://www.youtube.com/watch?v=ABC123xyz -> ABC123xyz

  startTime must include the timezone offset.
  Houston/Central Daylight Time example: 2026-07-26T19:00:00-05:00
*/
window.MXS_LIVE_CONFIG = {
  status: "offline",
  youtubeVideoId: "",

  eventTitle: "MotoXsyndicate Outdoor Championship",
  subtitle: "Race coverage, event information, and results—all in one place.",
  round: "Next Broadcast",
  track: "Track To Be Announced",
  session: "Race Coverage",
  raceClass: "Open Class",
  raceFormat: "Two Motos",
  server: "MXS Racing",
  host: "MotoXsyndicate",
  eventDate: "To Be Announced",
  eventTime: "To Be Announced",
  startTime: "",

  announcement: "The next MXS broadcast will appear here.",
  ticker: "",
  scheduleNote: "Times shown in Central Time.",

  registrationUrl: "",
  resultsUrl: "",
  discordUrl: "https://discord.gg/2XXBNqXJwD",

  schedule: [
    { time: "6:00 PM", title: "Open Practice", detail: "Server opens for riders" },
    { time: "6:20 PM", title: "Qualifying", detail: "Timed qualifying session" },
    { time: "7:00 PM", title: "Moto 1", detail: "Championship points begin" },
    { time: "After Moto 1", title: "Moto 2", detail: "Final moto and overall results" }
  ],

  nextEvent: {
    title: "More MXS racing coming soon",
    description: "The next event will be announced through Discord and MotoXsyndicate.com.",
    date: "Date TBA",
    track: "Track TBA"
  },

  sponsors: [
    { name: "MOTOXSYNDICATE", label: "Official Series Organizer", url: "https://www.motoxsyndicate.com" },
    { name: "PARTNER SPACE", label: "Broadcast sponsorship available", url: "" },
    { name: "PARTNER SPACE", label: "Support MXS race coverage", url: "" }
  ]
};
