(function() {

	chrome.runtime.sendMessage({command: 'activateTab'});

	var interval;				//holder for our main loop
	var pauseInterval;			//holder for loop to watch for pause button

	var startTime;				//Date object of when user started sleep timer
	var sleepTimer; 			//Length of time sleep time is - in ms (0 = infinite)
	var started;				//bool - tells if user has started sleep timer

	var paused;					//bool - checks if we are paused so we don't shutdown while paused
	var pauseStart;				//Date object of when pause stated
	var pauseStop;				//Date object of when pause stopped

	var sleepEpisodes = 0; 		//Number of episodes the user wants to watch (0 = infinite)
	var seasons = 0; 			//Counter for number of seasons watched (unused)
	var episodes = 0;			//Counter for number of episodes watched
	var eppEnded;				//Bool used to count episodes correctly

	var sleepStarted;			//bool - makes sure we don't run sleep function twice
	var shutdown;				//bool - if user wants to sleep/shutdown at end

	chrome.runtime.onMessage.addListener(function(data, sender, sendResponse) {
		switch (data.action) {
			case 'play-pause':
				var play = document.getElementsByClassName('player-play-pause');
				if(play.length > 0) {
					play[0].click();
				}
				break;

			case 'next':
			var next = document.getElementsByClassName('player-next-episode');
				if(next.length > 0) {
					next[0].click();
				}
				break;

			case 'stop':
				var stop = document.getElementsByClassName('player-back-to-browsing');
				if(stop.length > 0) {
					stop[0].click();
				}
				break;

			case 'prev':
				break;

			case 'sleep':
				sleep();
				sendResponse('Playback Paused - Timer Cleared');
				break;

			case 'start':
				start(data);
				sendResponse('Started');
				break;

			case 'update':
				sendResponse({
					timeDiff: sleepTimer ? parseInt((sleepTimer-(new Date() - startTime)) / 60 / 1000) : false,
					episodes: episodes,
					shutdown: shutdown,
					started: started,
					eppsLeft: sleepEpisodes ? sleepEpisodes - episodes : 0
				});
				break;

			case 'exit':
				exit();
				sendResponse('Exited');

		}
	});

	//Pauses video, then puts then runs the shutdown if the user wants
	function sleep() {
		var pauseSleepInterval;
		var pauseButton;

		clearInterval(interval);
		interval = false;

		//This just delays sleep if the current episode has been minimised - we wait till the start of the next to pause and shutdown
		pauseButton = document.getElementsByClassName('player-play-pause');
		pauseSleepInterval = setInterval(function() {
			if(pauseButton.length > 0) {
				clearInterval(pauseSleepInterval);
				pauseSleep = false;

				//pause playback
				pauseButton[0].click();

				//Run shutdown command
				if(shutdown) {
					chrome.runtime.sendMessage({shutdown: 'now'});
				}
			}
		}, 500);
	}

	function start(data) {
		started = true;
		startTime = new Date();
		shutdown = data.shutdown;
		sleepTimer = data.sleepTimer;
		sleepEpisodes = data.sleepEpisodes;

		if(!interval) {
			//Start our main watcher loop
			interval = setInterval(function() {
				var currentTime = new Date();
				var timeDiff = (sleepTimer-(currentTime - startTime)) / 60 / 1000;

				// Check if autoplay-interrupt has fired
				if(document.getElementsByClassName('player-autoplay-interrupter').length > 0 && document.getElementsByClassName('continue-playing').length > 0) {
					//Just click the continue button!
					document.getElementsByClassName('continue-playing')[0].click();
				}

				//Check if at end of season
				if (document.getElementsByClassName('player-postplay-autoplay-header') && document.getElementsByTagName('video').length === 0 && document.getElementsByClassName('player-postplay-still-hover').length > 0) {
					//Click the next video picture
					document.getElementsByClassName('player-postplay-still-hover')[0].click();

					//This counts the number of season watched - but I'm not using that currently
					seasons++;
				}

				//This counts the number of episodes watched
				if(!eppEnded && document.getElementsByClassName('player-postplay-still-hover').length > 0 && document.getElementsByTagName('video').length > 0) {
					episodes++;
					eppEnded = true;
				}

				//Support for chromecast
				//From: https://chrome.google.com/webstore/detail/netflix-chromecast-post-p/jellhddfmghffefbofeokbdbcnljabmg?utm_source=chrome-app-launcher-info-dialog
				if (document.getElementById('mdx-controls-wrapper')) {
					var player = document.getElementById('mdx-controls-wrapper').getElementsByTagName('progress')[0];
					if(player.max > 200 && player.value + 5 > player.max) {
						var nextEpId = 1+parseInt(document.getElementsByClassName('episode-list-item--expanded')[0].getAttribute('data-episode-id'));
						var nextEpEl = document.querySelectorAll('[data-episode-id="'+nextEpId+'"]')[0].getElementsByClassName('play-icon')[0];
						
						episodes++;
						eppEnded = true;

						nextEpEl.click();
						nextEpEl.click();						
					}
				}

				//This is so we only count each episode once
				if(document.getElementsByClassName('player-postplay-still-hover').length === 0) {
					eppEnded = false;
				}

				//This checks if our sleep timer has finished OR we have watched the total # of episodes we want
				if((!paused &&!sleepStarted) && ((sleepTimer && timeDiff <= 0) || (sleepEpisodes && episodes >= sleepEpisodes))) {
					sleepStarted = true;
					exit();
					sleep();
				}
			}, 1000);
		}
	}

	function exit() {
		started = false;
		clearPause();
		if(!interval) {
			alert('You probably have to start before you exit.');
		} else {
			//stop the timer
			clearInterval(interval);
			interval = false;
		}
	}

	document.addEventListener('keypress', function(e){
		if(e.which === 17 && e.ctrlKey === true) {	//Ctrl + q = shutdown
			sleepStarted = true;
			exit();
			sleep();
		} else if(e.which === 32) {		//Stop countdown while paused (spacebar support)
			pauseFix();
		}
	});

	//setup watcher for pause button - not used yet
	pauseInterval = setInterval(function() {
		if(document.getElementsByClassName('player-play-pause').length > 0) {
			document.getElementsByClassName('player-play-pause')[0].addEventListener('click', pauseFix);
			clearInterval(pauseInterval);
		}
	}, 1000);

	//Updates start time so counter does not run while paused
	function pauseFix() {
		if(started) { //Verify that we are infact running first
			paused = true;
			pauseStop = pauseStart ? new Date() : false;	//Gets set on 'unpause'
			pauseStart = pauseStart || new Date();			//Gets set on 'pause'
			if(pauseStart && pauseStop) {
				//sleepTimer - fix sleep timer so pause doesn't count
				startTime = new Date(startTime.valueOf() + (pauseStop - pauseStart));
				clearPause();
			}
		}
	}

	//clears all of the pause data so we can live to pause another day
	function clearPause() {
		pauseStart = false;
		pauseStop = false;
		paused = false;
	}

})();