$(document).ready(function() {
    var socket = io();
    socket.on("play_tts", function () {
        console.log("play_tts");
        $('#ttsPrompt').val('TTS is playing');
    });
    $('#producerForm').submit(function(e) {
        e.preventDefault();

        var data = {
            user1: {
                name: $('#user1Name').val(),
                videoLink: $('#user1VideoLink').val()
            },
            user2: {
                name: $('#user2Name').val(),
                videoLink: $('#user2VideoLink').val()
            },
            roundNumber: $('#roundNumber').val(),
            matchNumber: $('#matchNumber').val(),
        };
        console.log(JSON.stringify(data, null, 2));
        socket.emit('newRoundData', data);
        //this.reset();
    });
    // emit toggle_overlay on click
    $('#toggleOverlay').click(function() {
        $('#ttsPrompt').val('');
        socket.emit('toggle_overlay');
    });
    $('#generateTTS').click(function() {
        const ttsPrompt = $('#ttsPrompt').val();
        socket.emit('generateTTS', ttsPrompt);
    });
    $('#sayTTS').click(function() {
        const ttsPrompt = $('#ttsPrompt').val();
        socket.emit('sayTTS', ttsPrompt);
    });
    $('#openRatingUser2').click(function() {
        let user = 'user2';
        let username = $('#user2Name').val();
        socket.emit('openRating',  {user, username});
    });
    $('#openRatingUser1').click(function() {
        let user = 'user1';
        let username = $('#user1Name').val();
        socket.emit('openRating', {user, username});
    });
    $('#closeRatingUser2').click(function() {
        let user = 'user2';
        let username = $('#user2Name').val();
        socket.emit('closeRating', {user, username});
    });
    $('#closeRatingUser1').click(function() {
        let user = 'user1';
        let username = $('#user1Name').val();
        socket.emit('closeRating', {user, username});
    });

    window.triggerMoan = function() {
        const user = $('#username').val();
        const password = $('#password').val();
        socket.emit('moan', { username: user, password: password, trusted: true });
      }
    
      window.triggerFart = function() {
        const user = $('#username').val();
        const password = $('#password').val();
        socket.emit('fart', { username: user, password: password, trusted: true });
      }
});
