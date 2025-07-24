import * as socketEvents from './ratings/socketEvents.js';
import * as domActions from './ratings/domActions.js';
import * as utils from './ratings/utils.js';

const leaderboard = window.leaderboard;

$(document).ready(function() {
    // Initialize DataTables with the correct order target for the hidden timestamp column
    var table = $('#youtubeTable').DataTable({
        dom: '<"top"i>rft<"bottom"lp><"clear">',
        destroy: true,
        order: [[4, 'desc']], 
        pageLength: 100,
        columnDefs: [
        { 'orderData':[4], 'targets': [5] },
        {
            targets: [4], // Index of the hidden timestamp column
            visible: false, // Hide the column
            searchable: false
        }
        ],
        paging: true,
    });
    // Apply the filter and redraw the table
    table.draw();
    // After DataTables initialization and data load
    utils.updateTimestamps(); 
    document.querySelectorAll('td[data-timestamp]').forEach(function(td) {
        var utcTimestamp = td.getAttribute('data-timestamp');
        td.querySelector('.local-time').textContent = utils.convertToUserTimezone(utcTimestamp);
    });
    document.querySelector('#youtubeTable').addEventListener('click', function(event) {
        // Check if the clicked element is a watch button
        if (event.target && event.target.matches('.watch-youtube-btn')) {
          var button = event.target;
          // Retrieve the video link from the data attribute
          var videoLink = button.getAttribute('data-video-link');
          // Open the video link in a new tab
          window.open(videoLink, '_blank');
        }
    });
    socketEvents.initializeSocketEvents(table);
    domActions.initializeDOMActions(leaderboard);
});