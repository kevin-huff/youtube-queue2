const connectedDice = {};

var this_js_script = $('script[src*=main]');
var data = this_js_script.attr('data'); 
const templateData = JSON.parse(data);
console.log('templateData',templateData);
$(document).ready(function() {
    $("#img1").attr("src", "portal.jpg");
    $(".fart-button").click(function() {
      playFart();
    });

    // Select all buttons on the page
    const buttons = document.querySelectorAll('button');

    // Attach an event listener to each button
    buttons.forEach(button => {
      button.addEventListener('click', maybeFire);
    });

  });
  var socket = io();
  socket.on("connect", () => {
    console.log('socket connected:',socket.connected); // true
  });
  // Twitch chat connection
  const client = new tmi.Client({
      options: { debug: true },
        identity: {
          username: templateData.username,
          password: templateData.password
        },
        channels: templateData.channels
  });
  client.connect().catch(console.error);
  // Create an array to store the last 10 messages
  let lastTenMessages = [];
  // Variable to store the desired username
  let desiredUsername = templateData.current_turn;
  let isChatOpen = true;
  // Listen for new messages in the chat
  client.on("message", (channel, tags, message, self) => {
    console.log('desiredUsername',desiredUsername);
    console.log('tags.username',tags.username);
    // Check if the message is from the desired user
    if (tags.username.toLowerCase() === desiredUsername.toLowerCase()) {
      // Add the message to the array
      lastTenMessages.push({ username: tags.username, message });

      // Remove the first element of the array if it exceeds 10 elements
      if (lastTenMessages.length > 10) {
        lastTenMessages.shift();
      }

      // Update the page with the new message
      updatePage(lastTenMessages);
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    socket.on("new_turn", function(msg){
      console.log("new_turn");
      desiredUsername = msg;
      lastTenMessages = [];
      updateTurn(msg);
    });
    socket.on("random_splot", function(msg){
      console.log("random_splot",msg);
      generate_splot(msg);
    });
    $.getJSON("historical_splots.json", function(data) {
      var keys = Object.keys(data);
      $('.splotEntry').autocomplete({
          source: keys
      });
    });
    updateTurn(templateData.current_turn);
    $('#pause').hide();
    $('#autoPick').click(function(){
      client.connect()
      .then((data) => {
        client.say(templateData.channels[0],'!ap');
        client.disconnect();
      }).catch((err) => {
          console.log(err);
      });
    });
    $('#randomPick').click(function(){
      client.connect()
      .then((data) => {
        client.say(templateData.channels[0], '!random');
        client.disconnect();
      }).catch((err) => {
          console.log(err);
      });
    });
    $('#nextPick').click(function(){
      client.connect()
      .then((data) => {
        client.say(templateData.channels[0], '!next');
        client.disconnect();
      }).catch((err) => {
          console.log(err);
      });
    });
    $('#toggle_ai').click(function(){
      console.log('toggle ai');
      socket.emit('ai_toggle', 'ai_off', (response) => {
        console.log(response);
        //Change the name of the button depending on the boolean returned
        if(response){
          $('#toggle_ai').text('Disable AI');
        } else {
          $('#toggle_ai').text('Enable AI');
        }
      });

    });
    $('#pause').click(function(){
      let timer_data = {
        'action' : 'pause',
        'timer_display' : $('#timer_display').text()
      };
      socket.emit('timer_admin', timer_data, (response) => {
        console.log(response);
      });
    });
    $('#resume').click(function(){
      let timer_data = {
        'action' : 'resume',
        'timer_display' : $('#timer_display').text()
      };
      socket.emit('timer_admin', timer_data, (response) => {
        console.log(response);
      })
    });
    startTimer();
  }, false);

  var CountDown = (function ($) {
    // Length ms 
    var TimeOut = 10000;
    // Interval ms
    var TimeGap = 1000;
    
    var CurrentTime = ( new Date() ).getTime();
    var EndTime = ( new Date() ).getTime() + TimeOut;
    
    var GuiTimer = $('#timer');
    var GuiPause = $('#pause');
    
    var Running = false;
    
    var UpdateTimer = function() {
      // Run till timeout
      if( CurrentTime + TimeGap < EndTime && Running ) {
          setTimeout( UpdateTimer, TimeGap );
      }
      // Countdown if running
      if( Running ) {
          CurrentTime += TimeGap;
          if( CurrentTime >= EndTime ) {
            Running = false;
            $('#pause').hide();
            $('#resume').hide();
            $('#reset').show();
            $('#timer_display').html('00:00');
            $('#timer_display').css('color','red');
          } else {
            // Update Gui
            var Time = new Date();
            Time.setTime( EndTime - CurrentTime );
            var Minutes = Time.getMinutes();
            var Seconds = Time.getSeconds();
            $('#timer_display').html( 
              String(Minutes).padStart(2, '0') + ':' + 
              String(Seconds).padStart(2, '0') );
            $('#resume').hide();
          }
      }
            
    };
    
    var Pause = function() {
        Running = false;
        $('#pause').hide();
        $('#resume').show();
        $('#reset').show();

    };
    
    var Resume = function() {
        Running = true;
        $('#pause').show();
        $('#resume').hide();
        $('#reset').hide();

        UpdateTimer();
    };
    
    var Start = function( Timeout ) {
      $('#timer_display').css('color','black');

        TimeOut = Timeout;
        CurrentTime = ( new Date() ).getTime();
        EndTime = ( new Date() ).getTime() + TimeOut;
        UpdateTimer();
    };
    
    return {
        Pause: Pause,
        Resume: Resume,
        Start: Start
    };
  })(jQuery);
  function updateTurn(text) {
      document.getElementById("current_player").innerHTML = "Current Player: " + text;
  }

  function updateBoard(splot_data){    
    var edit_string = "<button onClick = 'popEditModal(" + splot_data.id + ")' class='btn btn-sm btn-dark' title='Edit Splot'><i class='fa-solid fa-pen'></i></button>" + "\n";    
    var ba_complete_string = "<button onClick = 'breakAwaySplot("+ splot_data.id +")' class='btn btn-sm btn-dark' title='BA Replace Splot'><i class='fa-solid fa-dice-one'></i></button>" + "\n" +
    "<button onClick = 'completeSplot(" + splot_data.id + ")' class='btn btn-sm btn-dark'  title='Complete Splot'><i class='fa-solid fa-circle-check'></i></button>" + "\n";
    var splot_dots = '<span class="fa-stack"><span class="fa fa-circle-o fa-stack-2x"></span><strong class="fa-stack-1x" id="splot_dot_' + splot_data.id + '">' + splot_data.splot_dot + '</strong></span>'+ "\n";
    var splot_dot_increase = "<button onClick = 'splotDotIncrease(" + splot_data.id + ")' class='btn btn-sm btn-dark'  title='Increase Splot Dot'><i class='fa-solid fa-plus-circle'></i></button>" + "\n";
    var splot_dot_decrease = "<button onClick = 'splotDotDecrease(" + splot_data.id + ")' class='btn btn-sm btn-dark'  title='Decrease Splot Dot'><i class='fa-solid fa-minus-circle'></i></button>" + "\n";
    var fart_button = "<button onClick='playFart()' class='btn btn-sm btn-dark fart-button'  title='Careful'><i class='fa-solid fa-poop'></i></button>";
    
    var innerHTML = "<div class='row'>" +
      '<div class="col-md-8">' +
        '<h3 >' + splot_data.id + ': <span id="splotEntry_' + splot_data.id + '">' + splot_data.entry + '</span></h3>' +
      '</div>' +
      '<div class="col-md-1">' +
        '<span class="fa-stack float-right fa-beat">' +
          '<span class="fa fa-circle-o fa-stack-2x"></span>' +
          '<strong class="fa-stack-1x" id="splot_dot_' + splot_data.id + '">' + splot_data.splot_dot + '</strong>' +
        '</span>' +
      '</div>' +
      '<div class="col-md-3" id="new_splot_'+ splot_data.id +'_buttons">' + 
        '<div class="row">' +
          '<div class="col-md-12">' +
              '<div class="btn-group" role="group">' +
                splot_dot_increase + ba_complete_string +
              "</div>" +
          "</div>" +
        "</div>" +
        '<div class="row">' +
          '<div class="col-md-12">' +
              '<div class="btn-group" role="group">' +
                splot_dot_decrease + edit_string + fart_button + 
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
        
    var this_splot = document.getElementById('splot_' + splot_data.id);

    if (this_splot) {
        this_splot.innerHTML = innerHTML;
    } else {
      var div = document.createElement("div");
      div.className = "col-md-6";
      div.id = 'splot_' + splot_data.id;
      div.innerHTML = innerHTML;
      document.getElementById("board").appendChild(div);
    }
  }

  function getSplotData(splot_id){
    let current_splot_dots = parseInt(document.getElementById("splot_dot_" + splot_id).innerHTML);
    let current_splot_entry = document.getElementById("splotEntry_" + splot_id).innerHTML.trim();
    let splot_data = {
        id: splot_id,
        entry: current_splot_entry,
        splot_dot: current_splot_dots
    }
    console.log('getSplotData',splot_data)
    return splot_data;
  }
  

  // Breakaway Editing
  function breakawayDecrease(ba_id){
    let baData = getBreakawayData(ba_id);
    let new_ba_dot = baData.ba_dots - 1;
    let ba_data = {
        id: ba_id,
        name: baData.name,
        ba_dots: new_ba_dot
    }
    console.log(ba_data);
    updateBreakaways(ba_data)
    socket.emit('ba_admin', ba_data, (response) => {
      console.log(response);
    });
  }
  function breakawayIncrease(ba_id){
    let baData = getBreakawayData(ba_id);
    let new_ba_dot = parseInt(baData.ba_dots) + 1;
    let ba_data = {
        id: ba_id,
        name: baData.name,
        ba_dots: new_ba_dot
    }
    console.log(ba_data);
    updateBreakaways(ba_data)
    socket.emit('ba_admin', ba_data, (response) => {
      console.log(response);
    });
  }
  function popEditBreakawayModal(ba_id) {
    let baData = getBreakawayData(ba_id);
    console.log('popEditBreakawayModal',baData);
    $('#editBreakawayId').val(baData.id);
    $('#addBreakawayName').val(baData.name);
    $('#addBreakawayDots').val(baData.ba_dot);
    $('#editBreakaway').modal('show');
  }
  function editBreakaway() {
    let ba_id = $('#editBreakawayId').val();
    let ba_name = $('#addBreakawayName').val();
    let ba_dot = $('#addBreakawayDots').val();
    let ba_data = {
        id: ba_id,
        name: ba_name,
        ba_dot: ba_dot
    }
    updateBreakaways(ba_data)
    socket.emit('ba_admin', ba_data, (response) => {
      console.log(response);
    });
    $('#editBreakaway').modal('hide');
  }
  function addBreakaway() {
    let ba_count = document.getElementById("breakaways").childElementCount;
    let ba_id = ba_count + 1;
    let ba_name = $('#addBreakawayName').val();
    let ba_dots = $('#addBreakawayDots').val();
    let ba_data = {
        id: ba_id,
        name: ba_name,
        ba_dots: ba_dots
    }
    console.log('ba_data',ba_data);
    updateBreakaways(ba_data)
    socket.emit('ba_admin', ba_data, (response) => {
      console.log(response);
    });
    $('#addBreakaway').modal('hide');
  }

  function updateBreakaways(ba_data){    
    var ba_dot_increase = "<button onClick = 'breakawayIncrease(" + ba_data.id + ")' class='btn btn-sm btn-dark'  title='Increase Splot Dot'><i class='fa-solid fa-plus-circle'></i></button>" + "\n";
    var ba_dot_decrease = "<button onClick = 'breakawayDecrease(" + ba_data.id + ")' class='btn btn-sm btn-dark'  title='Decrease Splot Dot'><i class='fa-solid fa-minus-circle'></i></button>" + "\n";
    var ba_edit = "<button onClick = 'popEditBreakawayModal(" + ba_data.id + ")' class='btn btn-sm btn-dark'  title='Edit Breakaway'><i class='fa-solid fa-pen'></i></button>" + "\n";
    var innerHTML = '<div class="row">' +
            '<div class="col-md-8">' +
              '<h3><span id=\'breakawayName_' + ba_data.id + '\'>'+ ba_data.name + '</span> Breakaways</h3>' +
            '</div>' +
            '<div class="col-md-1">' +
              '<span class="fa-stack float-right fa-beat">' +
                '<span class="fa fa-circle-o fa-stack-2x"></span>' +
                '<strong class="fa-stack-1x" id="ba_dot_' + ba_data.id + '">' +
                  ba_data.ba_dots +
                '</strong>' +
              '</span>' +
            '</div>' +
            '<div class="col-md-3">' +
              ba_dot_increase +
              ba_dot_decrease +
              ba_edit +
              "<button class='btn btn-sm btn-dark fart-button'  title='Careful'><i class='fa-solid fa-poop'></i></button>" +
            '</div>' +
            '</div>' + "\n";
        
    var this_ba = document.getElementById('breakaway_' + ba_data.id);

    if (this_ba) {
        this_ba.innerHTML = innerHTML;
    } else {
      var div = document.createElement("div");
      div.className = "col-md-6";
      div.id = 'breakaway_' + ba_data.id;
      div.innerHTML = innerHTML;
      document.getElementById("breakaways").appendChild(div);
    }
  }

  function getBreakawayData(ba_id){
    let current_ba_dots = parseInt(document.getElementById("ba_dot_" + ba_id).innerHTML);
    let current_ba_name = document.getElementById("breakawayName_" + ba_id).innerHTML.trim();
    let ba_data = {
        id: ba_id,
        name: current_ba_name,
        ba_dots: current_ba_dots
    }
    console.log('getBreakawayData',ba_data)
    return ba_data;
  }

  function clearBreakaways(){
    if (confirm("Sure you wanna clear the breakaways?") == true) {
      socket.emit('clear_breakaways', 'clear', (response) => {
            console.log(response);
      });
      document.getElementById("breakaways").innerHTML = "";
    }
  }

  
  function editSplot(splot_id){
    let new_splot = prompt('Enter new splot:');
    let splot_data = {
        id: splot_id,
        entry: new_splot,
        splot_dot: 1
    }
    updateBoard(splot_data)
    socket.emit('board_admin', splot_data, (response) => {
      console.log(response);
    });
  }
  function breakAwaySplot(splot_id){
    let splot_data = getSplotData(splot_id);
    splot_data.action = 'Breakaway Replace';
    socket.emit('log_action', splot_data, (response) => {
      console.log(response);
    });
    popEditModal(splot_id);
  }
  function completeSplot(splot_id){
    let splot_data = getSplotData(splot_id);
    splot_data.action = 'Completed';
    let new_splot_data = {
        id: splot_id,
        entry: "Blank Splot",
        splot_dot: 1
    }
    updateBoard(new_splot_data)
    socket.emit('board_admin', new_splot_data, (response) => {
      console.log(response);
    });
    socket.emit('log_action', splot_data, (response) => {
      console.log(response);
    });
  }
  
  function splotDotDecrease(splot_id){
    let spotData = getSplotData(splot_id);
    let new_splot_dot = spotData.splot_dot - 1;
    let splot_data = {
        id: splot_id,
        entry: spotData.entry,
        splot_dot: new_splot_dot
    }
    console.log(splot_data);
    updateBoard(splot_data)
    socket.emit('board_admin', splot_data, (response) => {
      console.log(response);
    });
  }
  function splotDotIncrease(splot_id){
    let spotData = getSplotData(splot_id);
    let new_splot_dot = spotData.splot_dot + 1;
    let splot_data = {
        id: splot_id,
        entry: spotData.entry,
        splot_dot: new_splot_dot
    }
    console.log(splot_data);
    updateBoard(splot_data)
    socket.emit('board_admin', splot_data, (response) => {
      console.log(response);
    });
  }
  function popEditModal(splot_id) {
    let splot_data = getSplotData(splot_id);
    console.log('popeditmodal',splot_data);
    $('#editSplotId').val(splot_data.id);
    $('#editSplotEntry').val(splot_data.entry);
    $('#editSplotDot').val(splot_data.splot_dot);
    $('#editSplot').modal('show');
  }
  function editSplot() {
    let splot_id = $('#editSplotId').val();
    let splot_entry = $('#editSplotEntry').val();
    let splot_dot = $('#editSplotDot').val();
    let splot_data = {
        id: splot_id,
        entry: splot_entry,
        splot_dot: splot_dot
    }
    updateBoard(splot_data)
    socket.emit('board_admin', splot_data, (response) => {
      console.log(response);
    });
    $('#editSplot').modal('hide');
  }
  function addSplot() {
    let splot_count = document.getElementById("board").childElementCount;
    let splot_id = splot_count + 1;
    let splot_entry = $('#addSplotEntry').val();
    let splot_dot = $('#addSplotDot').val();
    let splot_data = {
        id: splot_id,
        entry: splot_entry,
        splot_dot: splot_dot
    }
    updateBoard(splot_data)
    socket.emit('board_admin', splot_data, (response) => {
      console.log(response);
    });
    $('#addSplot').modal('hide');
  }
  function startTimer(thisCountDown = CountDown) {
    let minutesAndSecOut = $('#timer').val();
    
    let minutesAndSec = minutesAndSecOut.split(':');
    console.log(minutesAndSec)
    let totalSecondsOut = parseInt(minutesAndSec[0])*60;
    if(minutesAndSec.length > 1){
      totalSecondsOut += parseInt(minutesAndSec[1]);
    } else {
      minutesAndSec[1] = '00';
    }
    $('#timer_display').html(minutesAndSec[0] + ':' + minutesAndSec[1]);
    let milsecondsOut = totalSecondsOut * 1000;
    let timer_data = {
        timer_value: milsecondsOut,
        timer_display: minutesAndSec[0] + ':' + minutesAndSec[1],
        action: 'start'
    }
    console.log(timer_data);
    socket.emit('timer_admin', timer_data, (response) => {
      console.log(response);
    });
    thisCountDown.Start(milsecondsOut);
    $('#pause').removeClass('d-none')
    $('#pause').hide();
    $('#resume').removeClass('d-none');
    $('#resume').show();
    $('#reset').hide();
    jQuery('#pause').on('click',thisCountDown.Pause);
    jQuery('#resume').on('click',thisCountDown.Resume);
  }
  function clearBoard(){
      // javascript confirm
      if (!confirm('Are you sure you want to clear the board?')) {
        return;
      }
      $('#board').fadeOut();
      document.getElementById("board").innerHTML = "";
      $('#board').fadeIn();
      socket.emit('clear_board', true, (response) => {
        console.log(response);
      });
    }
    function get_random_splot(){
      socket.emit('get_random_splot', true, (response) => {
        console.log(response);
        // Set value of .splot_entry but uppercase the words
        let splot_entry_words = response.split(' ');
        let splot_entry_words_upper = [];
        for (let i = 0; i < splot_entry_words.length; i++) {
          splot_entry_words_upper.push(splot_entry_words[i].charAt(0).toUpperCase() + splot_entry_words[i].slice(1));
        }
        let splot_entry_upper = splot_entry_words_upper.join(' ');
        console.log('splot_entry_upper',splot_entry_upper);
        $('.splotEntry').val(splot_entry_upper);    

      });
    }
    function generate_splot(random_splot) {
      $('#addSplotEntry').val(random_splot);
    }
    function playFart(){
      // Get a random number between 0 and 9
      const randomNumber = Math.floor(Math.random() * 10);
      // Get the audio element with the ID of "fart_0" through "fart_9"
      const fart = document.getElementById(`fart_${randomNumber}`);
      fart.play();
    }
    function maybeFire() {
      // Generate a random number between 0 and 1
      const randomNumber = Math.random();

      // If the random number is less than 0.2, execute the function
      if (randomNumber < 0.02) {
        playFart();
      }
    }
    // Toggle the chat window
    function toggleChat() {
      isChatOpen = !isChatOpen;
      document.querySelector("#messages-list").style.display = isChatOpen ? "block" : "none";
      document.querySelector("#chat-toggle").className = isChatOpen ? "fas fa-chevron-down" : "fas fa-chevron-up";
    }

    // Update the page with the new messages
    function updatePage(messages) {
      // Clear any existing messages
      document.querySelector("#messages-list").innerHTML = "";

      // Loop through each message and add a bootstrap toast for the message
      messages.forEach(({ username, message }) => {
		const toast = document.createElement("div");
		toast.className = "toast";
		toast.setAttribute("role", "alert");
		toast.setAttribute("aria-live", "assertive");
		toast.setAttribute("aria-atomic", "true");
		toast.setAttribute("data-delay", "45000");
		toast.innerHTML = `
		  <div class="toast-header">
			<strong class="mr-auto">${username}</strong>
			<small class="text-muted">just now</small>
			<button type="button" class="ml-2 mb-1 close" data-dismiss="toast" aria-label="Close">
			  <span aria-hidden="true">&times;</span>
			</button>
		  </div>
		  <div class="toast-body">
			${message}
		  </div>
		`;

		document.querySelector("#messages-list").appendChild(toast);
		new bootstrap.Toast(toast).show();
      });
    }
/**
 * @fileoverview GoDice class for connecting to and controlling a GoDice Bluetooth die.
 * @author GoDice
 * @license MIT
 * @version 1.0.0
 * 
 * Dice stuff starts here.
 * 
 */

// Open the Bluetooth connection dialog for choosing a GoDice to connect
function openConnectionDialog() {
	const newDice = new GoDice();
	newDice.requestDevice();
}

/**
 * Get a new dice element or it's instance if it already exists
 * @param {string} diceId - the die unique identifier	 
 */
function getDiceHtmlEl(diceId) {
    let diceHtmlEl = document.getElementById(diceId);
    if (!diceHtmlEl) {
        diceHtmlEl = document.createElement("div");
        diceHtmlEl.id = diceId;
        diceHtmlEl.className = "dice-wrapper";
    }
    return diceHtmlEl;
}


GoDice.prototype.onDiceConnected = (diceId, diceInstance) => {

	console.log("Dice connected: ", diceId);
	
	// Called when a new die is connected - create a dedicate panel for this die
	connectedDice[diceId] = diceInstance;

	// get new die element or it's instance if it's already exists
	const diceHtmlEl = getDiceHtmlEl(diceId);
	// Check to see if the die element already exists
	if (!diceHtmlEl.firstChild) {
		// clear existing die element content if it exists
		while (diceHtmlEl.firstChild) {
			diceHtmlEl.removeChild(diceHtmlEl.lastChild);
		}
		
		// get die host from html, where we will put our connected dices
		const diceHost = document.getElementById("dice-host");

		// add name to die element
		const diceName = document.createElement('div');
		
		diceName.className = 'dice-name';
		diceName.textContent = `Dice ID: ${diceId}`;
		diceHtmlEl.append(diceName)
		// create input field for dice title
		const diceTitleInput = document.createElement('input');
		diceTitleInput.type = 'text';
		diceTitleInput.placeholder = 'Enter Dice Title';
		diceTitleInput.id = `dice-title-${diceId}`;
		diceHtmlEl.append(diceTitleInput);

		// add battery level button goDice.getBatteryLevel(diceId);
		const batteryLevelButton = document.createElement('button');
		batteryLevelButton.className = 'btn btn-outline-primary';
		batteryLevelButton.onclick = diceInstance.getBatteryLevel.bind(diceInstance);
		batteryLevelButton.textContent = 'Get Battery Level';
		diceHtmlEl.append(batteryLevelButton)

		// add battery level indicator
		const batteryIndicator = document.createElement('div');
		batteryIndicator.id = `${diceId}-battery-indicator`;
		diceHtmlEl.append(batteryIndicator)

		// set RGB color for the Led (e.g. blue)
		const colorProfile = [[0, 0, 255], [0, 0, 255]];

		// add "Led On" button to use goDice.switchOnLed(diceId,colorProfile) function
		const ledOnButton = document.createElement('button');
		ledOnButton.className = 'btn btn-outline-primary';
		ledOnButton.onclick = diceInstance.setLed.bind(diceInstance, colorProfile[0], colorProfile[1])
		ledOnButton.textContent = 'Switch On Led';
		diceHtmlEl.append(ledOnButton)

		// add "Led Off" button to use goDice.switchOffLed(diceId) function
		const ledOffButton = document.createElement('button');
		ledOffButton.className = 'btn btn-outline-primary';
		ledOffButton.onclick = diceInstance.setLed.bind(diceInstance, [0], [0])
		ledOffButton.textContent = 'Switch Off Led';
		diceHtmlEl.append(ledOffButton)
		
		// Pulse Led
		const ledPulseButton = document.createElement('button');
		ledPulseButton.className = 'btn btn-outline-primary';
		ledPulseButton.onclick = diceInstance.pulseLed.bind(diceInstance, 5, 30, 20, [0, 0, 255])
		ledPulseButton.textContent = "Pulse"
		diceHtmlEl.append(ledPulseButton)
		
		// get Dice color to use goDice.getDiceColor(diceId) function
		const getDiceColorButton = document.createElement('button');
		getDiceColorButton.className = 'btn btn-outline-primary';
		getDiceColorButton.onclick = diceInstance.getDiceColor.bind(diceInstance)
		getDiceColorButton.textContent = 'Get Dice Color';
		diceHtmlEl.append(getDiceColorButton)
		
		// Change die type buttons select
		const d6Button = document.createElement('button');
		d6Button.className = 'diebtn btn-outline-primary';
		d6Button.onclick = diceInstance.setDieType.bind(diceInstance, GoDice.diceTypes.D6)
		d6Button.textContent = 'D6';
		diceHtmlEl.append(d6Button)
		
		// D20 Shell
		const d20Button = document.createElement('button');
		d20Button.className = 'diebtn btn-outline-primary';
		d20Button.onclick = diceInstance.setDieType.bind(diceInstance, GoDice.diceTypes.D20)
		d20Button.textContent = 'D20';
		diceHtmlEl.append(d20Button)
		
		const d10Button = document.createElement('button');
		d10Button.className = 'diebtn btn-outline-primary';
		d10Button.onclick = diceInstance.setDieType.bind(diceInstance, GoDice.diceTypes.D10)
		d10Button.textContent = 'D10';
		diceHtmlEl.append(d10Button)
		
		const d10XButton = document.createElement('button');
		d10XButton.className = 'diebtn btn-outline-primary';
		d10XButton.onclick = diceInstance.setDieType.bind(diceInstance, GoDice.diceTypes.D10X)
		d10XButton.textContent = 'D10X';
		diceHtmlEl.append(d10XButton)
		
		// D4 Shell
		const d4Button = document.createElement('button');
		d4Button.className = 'diebtn btn-outline-primary';
		d4Button.onclick = diceInstance.setDieType.bind(diceInstance, GoDice.diceTypes.D4)
		d4Button.textContent = 'D4';
		diceHtmlEl.append(d4Button)
		
		const d8Button = document.createElement('button');
		d8Button.className = 'diebtn btn-outline-primary';
		d8Button.onclick = diceInstance.setDieType.bind(diceInstance, GoDice.diceTypes.D8)
		d8Button.textContent = 'D8';
		diceHtmlEl.append(d8Button)
		
		const d12Button = document.createElement('button');
		d12Button.className = 'diebtn btn-outline-primary';
		d12Button.onclick = diceInstance.setDieType.bind(diceInstance, GoDice.diceTypes.D12)
		d12Button.textContent = 'D12';
		diceHtmlEl.append(d12Button)
		

		// add battery level indicator
		const colorIndicator = document.createElement('div');
		colorIndicator.id = `${diceId}-color-indicator`;
		diceHtmlEl.append(colorIndicator)

		// add die status indicator
		const dieStatus = document.createElement('div');
		dieStatus.id = `${diceId}-die-status`;
		diceHtmlEl.append(dieStatus)

		// inject dice into html
		diceHost.appendChild(diceHtmlEl);
	} else {
		const alert = document.createElement('div');
		alert.className = 'alert alert-success';
		var diceName = document.getElementById("dice-title-" + diceId).value;

		alert.innerHTML = `${diceName} ${this.getDiceType(diceInstance)} is connected`;
		alert.id = `dice-alert-${diceId}`;

		// Get the global dice-message-container
		const globalMessages = document.getElementById('dice-message-container');
		globalMessages.replaceChild(alert, document.getElementById(`dice-alert-${diceId}`));

		// Remove the alert after 3 seconds
		setTimeout(() => {
			alert.remove();
		}, 3000);
	}
};


GoDice.prototype.onRollStart = (diceId) => {
	console.log("Roll Start: ", diceId);

	// get rolling indicator
	const diceIndicatorEl = document.getElementById(diceId + "-die-status");

	// show rolling 
	diceIndicatorEl.textContent = "Rollling....";
};

GoDice.prototype.onDiceDisconnected = (diceId, diceInstance) => {
	console.log("Dice Disconnected: ", diceId);
	// get rolling indicator
	const diceIndicatorEl = document.getElementById(diceId + "-die-status");
	// Get the global dice-message-container
	const globalMessages = document.getElementById('dice-message-container');
	// check if an alert already exists
	const existingAlert = document.getElementById(`dice-alert-${diceId}`);
	if (existingAlert) {
		return;
	}
	//Add alert
	const alertEl = document.createElement('div');
	alertEl.className = 'alert alert-danger fade show';
	var diceName = document.getElementById("dice-title-" + diceId).value;

	alertEl.innerHTML = `${diceName} ${this.getDiceType(diceInstance)} Disconnect`;
	alertEl.onclick = diceInstance.attemptReconnect.bind(diceId, diceInstance);
	alertEl.id = `dice-alert-${diceId}`;
	//add to the global message container
	globalMessages.prepend(alertEl);
	// show rolling 
	diceIndicatorEl.textContent = "disconnected";
	// Attempt to reconnect
	diceInstance.attemptReconnect(diceId, diceInstance);
  };

  
GoDice.prototype.onStable = function(diceId, value, xyzArray, diceInstance) {
	console.log("Stable event: ", diceId, value);
	// If it's a 3,6 or 1, pulse the led
	testForSpecialRoll(diceInstance,value);
	// Log the roll
	logRoll(diceId, value, diceInstance);
	// Get roll value indicator and show stable value
	const diceIndicatorEl = document.getElementById(diceId + "-die-status");
	diceIndicatorEl.textContent = "Stable: " + value;
};

GoDice.prototype.onTiltStable = function(diceId, value, xyzArray, diceInstance) {
    console.log("TiltStable: ", diceId, value);
	// If it's a 3,6 or 1, pulse the led
	testForSpecialRoll(diceInstance,value);
	// Log the roll
	logRoll(diceId, value, diceInstance);
	const diceIndicatorEl = document.getElementById(diceId + "-die-status");
    diceIndicatorEl.textContent = "Tilt Stable: " + value;
};

GoDice.prototype.onFakeStable = function(diceId, value, xyzArray, diceInstance) {
	console.log("FakeStable: ", diceId, value);
	// If it's a 3,6 or 1, pulse the led
	testForSpecialRoll(diceInstance,value);
	// Log the roll
	logRoll(diceId, value, diceInstance);
	// Get tile indicator and show fake value
	const diceIndicatorEl = document.getElementById(diceId + "-die-status");
	diceIndicatorEl.textContent = "Fake Stable: " + value;
};

GoDice.prototype.onMoveStable = function(diceId, value, xyzArray, diceInstance) {
	console.log("MoveStable: ", diceId, value);
	// If it's a 3,6 or 1, pulse the led
	testForSpecialRoll(diceInstance,value);
	// Log the roll
	logRoll(diceId, value, diceInstance);
	// Get tile indicator and show fake value
	const diceIndicatorEl = document.getElementById(diceId + "-die-status");
	diceIndicatorEl.textContent = "Move Stable: " + value;
};

GoDice.prototype.onBatteryLevel = (diceId, batteryLevel, diceInstance) => {
	console.log("BetteryLevel: ", diceId, batteryLevel);
	diceInstance.pulseLed(5, 30, 20, [0, 255, 0]);
	// get dice battery indicator element
	const batteryLevelEl = document.getElementById(diceId + "-battery-indicator");

	// put battery level value into battery indicator html element
	batteryLevelEl.textContent = batteryLevel;
};

GoDice.prototype.onDiceColor = function(diceId, color) {
	colorMapping = {
		BLACK: [255, 255, 255],
		RED: [255, 0, 0],
		GREEN: [0, 255, 0],
		BLUE: [0, 0, 255],
		YELLOW: [255, 255, 0],
		ORANGE: [255, 165, 0],
	}

	console.log("DiceColor: ", diceId, color);
	const colorName = Object.entries(this.diceColour).find(([name, number]) => number === color)[0];
	console.log(colorName);
	const colorRGB = colorMapping[colorName];
	
	// get dice color indicator element
	const diceColorEl = document.getElementById(diceId + "-color-indicator");

	// put dice color value into battery indicator html element
	diceColorEl.textContent = "Color: " + colorName;

	// Pulse Led
	this.pulseLed(5, 30, 20, colorRGB);
};


const textArea = document.getElementById("log");

// Function to test if it's a 1, 3 or 6
function testForSpecialRoll(diceInstance,value) {
  const dieTypeValue = diceInstance.dieType;
  if(dieTypeValue == 0) {
    if (value == 1) {
      console.log(value);
      diceInstance.pulseLed(5, 30, 20, [0, 255, 0]);
      const win_sound = document.getElementById(`win_sound`);
      win_sound.volume = 0.1;
      win_sound.play();
      console.log("Pulsing LED with green color");
    } else if (value == 3) {
      console.log(value);
      diceInstance.pulseLed(5, 30, 20, [255, 0, 0]);
      const lose_sound = document.getElementById(`lose_sound`);
      lose_sound.volume = 0.2;
      lose_sound.play();
      console.log("Pulsing LED with red color");
    } else if (value == 6) {
      console.log(value);
      diceInstance.pulseLed(5, 30, 20, [0, 0, 255]);
      const win_sound = document.getElementById(`win_sound`);
      win_sound.volume = 0.1;
      win_sound.play();
      console.log("Pulsing LED with blue color");
    }	
  }	
}


function logRoll(diceId, rollValue, diceInstance) {
    var diceName = document.getElementById("dice-title-" + diceId).value;
	const uuid = generateUUID();
    var timestamp = new Date();
    var timestampString = timestamp.toLocaleString();
	var log = document.getElementById("roll-log");
	log.insertAdjacentHTML('afterbegin', `<pre>[${timestampString}]: ${diceName} ${this.getDiceType(diceInstance)} rolled a ${rollValue}</pre>`);
	// Get the global dice-message-container
	const globalRollMessage = document.getElementById('dice-message-container');
	//Add alert
	const alertRoll = document.createElement('div');
	alertRoll.className = 'alert alert-info fade show';
	alertRoll.innerHTML = `${diceName} ${this.getDiceType(diceInstance)} rolled a ${rollValue}`;
	alertRoll.id = `dice-alert-${diceId}-${uuid}`;
	//add to the global message container
	globalRollMessage.prepend(alertRoll);
	// Remove the alert after 3 seconds
	setTimeout(() => {
		alertRoll.remove();
	}, 5000);
	// Make object of roll data
	const roll_data = {
		'dice_id': diceId,
		'roll_value': rollValue,
		'dice_name': diceName,
		'dice_type': this.getDiceType(diceInstance),
		'timestamp': timestampString
	};
	socket.emit('dice_roll', roll_data, (response) => {
        console.log(response);
	});
}

function getDiceType(diceInstance) {
	const dieTypeValue = diceInstance.dieType;
	const dieTypeString = Object.keys(GoDice.diceTypes).find(key => GoDice.diceTypes[key] === dieTypeValue);
	return dieTypeString;
}


// Add the generateUUID function
function generateUUID() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
	  var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
	  return v.toString(16);
	});
}