'use strict';
'require view';
'require poll';
'require request';
'require network';
'require ui';
'require rpc';
'require fs';
'require uci';
'require tools.prng as random';

/* ***************************************************** */
//	TODO
//
//  actually implement dedicated_5G_network (not just setting the pref)
//		(my R7800 either shows localhost & is client-available OR does a proper scan & is client-unavailable)
//	each radioX device should get a "Start Active Scanning..." & "Disable Active Scanning" buttons
//		(now that I know to avoid ui.createHandlerFn which was adding a class 'spinning' & button became unreachable in that Promise)
//	tiers [] in create_channel_graph is going to be a problem when there are frequent gaps (like China)
//	maybe disable GS prefs Save button if no changes
/* ***************************************************** */

var OUIdb = {};

return view.extend({
	callFrequencyList : rpc.declare({
		object: 'iwinfo',
		method: 'freqlist',
		params: [ 'device' ],
		expect: { results: [] }
	}),

	callInfo : rpc.declare({
		object: 'iwinfo',
		method: 'info',
		params: [ 'device' ],
		expect: { }
	}),
	
	callSurvey : rpc.declare({
		object: 'iwinfo',
		method: 'survey',
		params: [ 'device' ],
		expect: { results: [] }
	}),
	
	callGenOUIdb: rpc.declare({
		object: 'luci.channel_analysis_remix',
		method: 'gen_OUI_db',
		expect: { result: 1 }
	}),
	
	callDed5GUp: rpc.declare({
		object: 'luci.channel_analysis_remix',
		method: 'dedicated_5GHz_wif_up',
		expect: {  }
	}),
	
	callDed5GDown: rpc.declare({
		object: 'luci.channel_analysis_remix',
		method: 'dedicated_5GHz_wif_down',
		expect: {  }
	}),
	
	GetE: function(ID) {return document.getElementById(ID)},
 	 	
 	genOUIvar: function(throw_err) {
 		return fs.stat("/etc/OUI.json").then(function(fstats) {
 			if (fstats.size > 999000) {
 				fs.read_direct(fstats.path, 'text').then(function(response) { //now it becomes a JSON
 					OUIdb=JSON.parse(response);
 					//console.log(OUIdb["2091D9"]); //I'M SPA (more like I'M GOOD, thx)
 				});
 			return fstats;
 			}
 		}).catch(function(err, throw_err) {
 			if (throw_err)
				throw new Error(_('Unable to find /etc/OUI.json: %s').format(err.message));
		});
 	},
 	
	infoOUIdb: function(OUI_db_FS) {
		return 'PRESENT @ /etc/OUI.json<br>OUI db is '+OUI_db_FS.size.toLocaleString()+
					" bytes for "+Object.keys(OUIdb).length.toLocaleString()+" records. Downloaded: "+ new Date(OUI_db_FS.mtime*1000);
	},
	
	handleUpdateOUIdb: function() {
	 	ui.showModal("Updating...",null);
		this.callGenOUIdb().then(function(resp) {
			document.body.classList.remove('modal-overlay-active');
			if (resp == '1') {
				var OUI_db_FS = this.genOUIvar(true);
				this.GetE('OUI_info').textContent = this.infoOUIdb(OUI_db_FS);
		
				this.GetE('OUI_Upd_button').setAttribute('disabled',true);
			} else {
				throw new Error("There was a problem.");
			}
		}.bind(this));
	},

	handleDeleteOUIdb: function() {
		fs.remove("/etc/OUI.json").then(function(response) {
			if (response === 0) {
				this.GetE('OUI_Upd_button').setAttribute('disabled',true);
				this.GetE('OUI_Del_button').setAttribute('disabled',true);
				this.GetE('OUI_Get_button').removeAttribute('disabled');
				this.GetE('OUI_info').textContent = "NOT PRESENT<br>";
			}
		}.bind(this));
	},

 	handleDownloadOUIdb: function() {
 		ui.showModal("Downloading...",null);
		this.callGenOUIdb().then(function(resp) {
			document.body.classList.remove('modal-overlay-active');
			if (resp == '1') {
				var OUI_db_FS = this.genOUIvar(true);
				this.GetE('OUI_info').textContent = this.infoOUIdb(OUI_db_FS);
		
				this.GetE('OUI_Upd_button').removeAttribute('disabled');
				this.GetE('OUI_Del_button').removeAttribute('disabled');
				this.GetE('OUI_Get_button').setAttribute('disabled',true);
			} else {
				throw new Error("There was a problem.");
			}
		}.bind(this));
	},
	
	fuzzyOUIsearch: function(bssid) {
		var newID,
			results = [],
			hexID_A = bssid.replace(/:/g,'').split(''),
			hex = '0123456789ABCDEF'.split('');
		
		for (var i=0; i<6; i++) {
			newID="";
			for (var h=0; h<hex.length; h++) {
				for (var b=0; b<6; b++) {
					newID+= (i==b ? hex[h] : hexID_A[b]);
				}
				if (OUIdb[newID])
					if (!results.includes(newID))
						results.push(newID);
				newID="";
			}
		}
		return results;
	},
	
	fuzzyMACsearch: function (scanCache, a_bssid) {
		var results = [],
			a_octets = a_bssid.split(':');
		for (var bs in scanCache) {
			if (a_bssid === bs)
				continue;
			
			var o_matches=0,
			target_octets = bs.split(':');
			
			for (var o=0; o<a_octets.length; o++) {
				if (a_octets[o] === target_octets[o])
					o_matches++;
			}
			if (o_matches == 5)
				results.push(bs);
		}
		return results;
	},

	render_signal_badge: function(signalPercent, signalValue) {
		var icon, title, value;

		if (signalPercent < 0)
			icon = L.resource('icons/signal-none.png');
		else if (signalPercent == 0)
			icon = L.resource('icons/signal-0.png');
		else if (signalPercent < 25)
			icon = L.resource('icons/signal-0-25.png');
		else if (signalPercent < 50)
			icon = L.resource('icons/signal-25-50.png');
		else if (signalPercent < 75)
			icon = L.resource('icons/signal-50-75.png');
		else
			icon = L.resource('icons/signal-75-100.png');

		value = '%d\xa0%s'.format(signalValue, _('dBm'));
		title = '%s: %d %s'.format(_('Signal'), signalValue, _('dBm'));

		return E('div', {
			'class': 'ifacebadge',
			'title': title,
			'data-signal': signalValue
		}, [
			E('img', { 'src': icon }),
			value
		]);
	},
	
	switch_BSSID_OUI: function() {
		if (!Object.keys(OUIdb).length)
			return;
		
		var freq = this.radios[this.active_tab].graph.tab.getAttribute('frequency'),
			tableBSSIDcolumn = this.GetE('BSSID'+freq),
			col_opts = ['BSSID','Vendor'];
			
		tableBSSIDcolumn.innerHTML = col_opts[this.radios[this.active_tab].tableTick % 2];
		this.radios[this.active_tab].tableTick++;
	},

	add_wifi_to_graph: function(device, res, channels, channel_width) {
		var chanArr = [],
			chan, chanInc, xInc, xCenter, xWidth, signal, wPath,
			wifiE, wifiFE, wifiTE, wifiGroup,
			chan_analysis = this.radios[device].graph,
			scanCache = this.radios[device].scanCache,
			textCache = this.radios[device].textCache,
			offset_tbl = chan_analysis.offset_tbl,
			freq = chan_analysis.tab.getAttribute('frequency'),
			band_data = this.radios[device].freqData[freq],
			gStations = this.GetE(('Stations_'+freq)),
			noiseCE = this.GetE(('noiseclipPath'+freq)),
			sigMax = chan_analysis.offset_tbl[ '0dBm' ],		//5GHz = 0
			sigMin = chan_analysis.offset_tbl[ '-120dBm' ],		//5GHz = 238.6
 			sigInc = chan_analysis.sigInc,						//5GHz = 1.98
 			oldSignal=-255;
		
		function tranS(ns) { return Math.abs(ns)*sigInc; }
		
		for (var f in band_data) {
			chanArr.push(band_data[f].chn);
		}
		if (!chanArr.includes(res.channel)) {
			return; // tab was switched during a survey, results came in for wrong tab
		}
		
		chanInc = chanArr[1]-chanArr[0];
		xInc = chan_analysis.col_width/chanInc;
		
 		if (scanCache[res.bssid].graph == null)
 			scanCache[res.bssid].graph = { };
		
 		if (channels.length > 1) {
 			chan = ((channels[0]+channels[1])/2);
			xCenter = chan_analysis.offset_tbl[ chan] ;
		} else {
			chan = channels[0];
			xCenter = chan_analysis.offset_tbl[ chan ];
		}
		
		if (!textCache[chan].bssidA.includes(res.bssid)) {
			textCache[chan].signalH = Math.max(textCache[chan].signalH,res.signal);
			textCache[chan].bssidA.push(res.bssid);
		}
		
		if (scanCache[res.bssid].graph[freq] != null) {
			var sigPath, thisGroup = this.GetE(res.bssid);
			if (thisGroup) {
				for (var c = 0; c < thisGroup.childNodes.length; c++) {
					var cNode = thisGroup.childNodes[c];
					if (cNode.nodeName === "path" && cNode.id.startsWith(res.bssid)) {
        				oldSignal=parseInt(cNode.id.split("_")[1]);
    				}
				}
			}
		}
		if (scanCache[res.bssid].graph[freq] != null && res.signal != oldSignal) {
			L.dom.empty(res.bssid);
		}
		
		if (scanCache[res.bssid].graph[freq] == null || res.signal != oldSignal) {
				//a single channel is a5MHz subcarrier; 20MHz is 4 of them; when channel_width is '2', it isn't actually 2 channels, its 2(0)mhz
			xWidth = xInc * channel_width *2;
				//not quite the 16.25/20 from https://www.cnrood.com/en/media/solutions/Wi-Fi_Overview_of_the_802.11_Physical_Layer.pdf
			xWidth = xWidth * (17/20);
			signal = sigMax + tranS(res.signal);
		
			var xSpread = (sigMin-signal)/3;
			var xBaseW = xWidth+xSpread;
			var yTransP = sigMin-((sigMin-signal)*0.3); //30% rise from -120
		
			wPath=	"M"+(xCenter- ((xWidth+xSpread)*0.5))+","+sigMin+" ";
			wPath+=	"C"+(xCenter- ((xWidth*0.5)+(xSpread*0.25)))+","+sigMin /* x1,y1 */
						+","+(xCenter- (xWidth*0.5))+","+yTransP /* x2,y2 */
						+","+(xCenter- (xWidth*0.5))+","+signal /* endpoint */
						+" ";
			wPath+=	"H "+(xCenter+ (xWidth*0.5))+" ";
			wPath+=	"C"+(xCenter+ (xWidth*0.5))+","+yTransP /* x1,y1 */
						+","+(xCenter+ ((xWidth*0.5)+(xSpread*0.25)))+","+sigMin /* x2,y2 */
						+","+(xCenter+ ((xWidth*0.5)+(xSpread*0.5)))+","+sigMin /* endpoint */
						+" ";
			wifiE = E('path',{d: wPath, id: res.bssid+"_"+res.signal,
						style: 'stroke:'+scanCache[res.bssid].color+'; fill:none; stroke-width:3'},null,'SVG') //signal line
			wifiFE = E('path',{d: wPath+"z", id: res.bssid+"_"+res.signal,
						style: 'stroke:none; fill:'+scanCache[res.bssid].color+'; opacity:0.3'},null,'SVG') //signal fill
			
			if (noiseCE!=null) {
				if (noiseCE.firstElementChild != null) {
					L.dom.attr(wifiE, 'clip-path', 'url(#noiseclipPath'+freq+')'); //applies the noise floor clipPath to the signal stroke
				}
			}
			wifiGroup = this.GetE(res.bssid);
			if (!wifiGroup) {
				wifiGroup = E('g',{id: res.bssid},null,'SVG');
			} else {
				L.dom.empty(wifiGroup);
			}
			wifiTE = E('text',{x: xCenter, y: signal-8, id: res.bssid+'_tE', 'text-anchor': 'middle',
						'font-size': '14px', style: 'fill:'+scanCache[res.bssid].color}, res.ssid || res.bssid ,'SVG');
			
			L.dom.append(wifiGroup,[wifiE,wifiFE,wifiTE]);
			gStations.appendChild(wifiGroup);

			scanCache[res.bssid].graph[freq] = { group : wifiGroup };
		}
		L.dom.attr(scanCache[res.bssid].graph[freq].group, 'style', "z-index:"+(res.signal*-1)+ (res.stale ? '; opacity:0.5' : '') );
	},
	
	spreadTextLabels: function() {
		var textCache = this.radios[this.active_tab].textCache,
			sigInc = this.radios[this.active_tab].graph.sigInc;						//5GHz = 1.98

		function tranS(ns) { return Math.abs(ns)*sigInc; }
		
		for (var chan in textCache) {
			if (textCache[chan].bssidA.length) {
				var bsALen = textCache[chan].bssidA.length,
					abelH = tranS(textCache[chan].signalH),
					aLblH = Math.max(abelH / bsALen, 16);
					aLblH = Math.min(abelH / bsALen, 16);
				if (bsALen == 1) continue; // that text is already in the perfect spot
				for (var b=0; b < bsALen; b++) {
					var celltE = this.GetE(textCache[chan].bssidA[b]+"_tE");
					if (celltE) {
						L.dom.attr(celltE,'y', abelH-(b*aLblH) );
					}
				}
			}
		}
	},

	create_channel_graph: function(chan_analysis, freq) {
		var tiers = [], chan_list = [], chart_section_loc = [],
			channel_incr, max_chan_in_tier, channel_width, tier_height,
			t_start = 0, ch_gap = 0, sec_start = 0, chart_padding = 50, tier_padding = 28,
			band_data = this.radios[chan_analysis.tab.getAttribute('data-tab')].freqData[freq],
			textCache = this.radios[chan_analysis.tab.getAttribute('data-tab')].textCache,
			svgChart = this.GetE('chartarea'+freq),
			chart_height = parseInt(chan_analysis.graph.style.height.replace("px", "")),
			chart_width = chan_analysis.tab.getBoundingClientRect().width, //940
 			gYaxis, gNoise, gStations, gXaxis;
			
		function TestEndChannel(ch,tier_arr) {
 			for (var t=0; t< tier_arr.length; t++) {
 				if (ch == tier_arr[t][tier_arr[t].length-1]) {
 					return 1;
 				}
 			}
 			return 0;
 		}
		    
		for (var frq in band_data) {
			chan_list.push(band_data[frq].chn);
			textCache[band_data[frq].chn] = { signalH: -255, bssidA: [] }; //opportunistic initial fill
		}
		channel_incr = chan_list[1]-chan_list[0];
		
		for (var i=0; i< chan_list.length-1; i++) {
 			if (chan_list[i+1] > chan_list[i]+channel_incr) {
				tiers.push(chan_list.slice(t_start,(i+1)));
				t_start=i+1;
			}
			if (i == 13 && tiers.length == 0) { //split up really long continuous bands (non-supported 6G/60G)
				tiers.push(chan_list.slice(t_start,(i+1)));
				t_start=i+1;
			}
			if (chan_list.length == (i+2)) {
				tiers.push(chan_list.slice(t_start,chan_list.length));
				max_chan_in_tier = chan_list.length-t_start;
			}
		}
		//tiers =	//2.4G = [ [1,2,3,4,5,6,7,8,9,10,11] ];
					//5G = [ [36,40,44,48,52,56,60,64],[100,104,108,112,116,120,124,128,132,136,140,144],[149,153,157,161,165] ]
		
		for (var i=0; i< tiers.length; i++) {
			max_chan_in_tier = Math.max(max_chan_in_tier,tiers[i].length);
		}
		
		if (chan_list.length < 14) { //increase padding @ start & end channels of 2.4GHz chart
			ch_gap+=2;
			max_chan_in_tier+=4;
		}
		channel_width = (chart_width - chart_padding)/(max_chan_in_tier+1); //padding
		chan_analysis.col_width = channel_width;
		tier_height = (chart_height-(tier_padding*tiers.length)) / tiers.length;
		
		gXaxis = E('symbol',{width: (chan_list.length + ch_gap + tiers.length)*channel_width, id:"Chart_XLabels"+freq},null,'SVG');
		gYaxis = E('g',{},null,'SVG');
						 
		for (var i=0; i<chan_list.length; i++) {
			var ch_transl, gchannel;
				
			if ((chan_list[i+1] - chan_list[i] != channel_incr) & (i+1 != chan_list.length)) {
				////when a break is detected, add a 1/2 width spacer at the end
				ch_transl=channel_width*(i+1) + channel_width*(ch_gap++) + channel_width*0.5;
				if (TestEndChannel(chan_list[i],tiers)) {
					chart_section_loc.push([sec_start,ch_transl]);
					sec_start = channel_width*0.5 + ch_transl;
				}
			} else {
				ch_transl=channel_width*0.5 + channel_width*(i+1) + channel_width*ch_gap;
				if (i+1 == chan_list.length) {
					//more padding to ensure symbol width shows chart end
					chart_section_loc.push([sec_start, (chan_list.length < 14 ? ch_transl+(2*channel_width) : ch_transl) ]);
				}
			}
			chan_analysis.offset_tbl[ chan_list[i] ] = ch_transl;
			if (freq == "5GHz") {
				chan_analysis.offset_tbl[ (chan_list[i]-2) ] = ch_transl-(channel_width/2);
				chan_analysis.offset_tbl[ (chan_list[i]+2) ] = ch_transl+(channel_width/2);
				textCache[(chan_list[i]-2)] = { signalH: -255, bssidA: [] }; //opportunistic initial fill
				textCache[(chan_list[i]+2)] = { signalH: -255, bssidA: [] }; //opportunistic initial fill
			}
			gchannel = E('g',{transform: "translate("+ch_transl+",3)"},null,'SVG');
			L.dom.append(gchannel, [
						E('text',{x: 0, y: tier_height+16, 'text-anchor': 'middle', 'font-size': '18px', style: 'fill:#999'},chan_list[i],'SVG'),
						E('line',{x1: 0, x2: 0, y1: 0, y2: tier_height, stroke: '#666'},null,'SVG') ]);
			gXaxis.appendChild(gchannel);
		}
		
		for (var t=0; t< tiers.length; t++) {
			var gTier = E('g',{},null,'SVG');
			
			for (var j=0; j>=-120; j-=10) {
				var y_height = (tier_height+tier_padding)*t + (tier_height/120)*Math.abs(j);
				if (t==0) {
					chan_analysis.offset_tbl[ j+"dBm" ] = y_height;
				}
				L.dom.append(gTier, [E('text',{x: -20, y: y_height+5, 'text-anchor': 'end', 'font-size': '11px', style: 'fill:#999'}, j ,'SVG'),
									 E('line',{x1: -10, x2: -16, y1: y_height+2, y2: y_height+2, stroke: '#999'},null,'SVG') ]);
			}
			gYaxis.appendChild(gTier); 
			svgChart.appendChild( E('use',{x: -(chart_section_loc[t][0]+25), width: (chart_section_loc[t][1]+chart_section_loc[t][0]+75), 
									transform:'translate(-20,'+((tier_height+tier_padding)*t)+')', href:'#Chart_XLabels'+freq},null,'SVG') );
		}
		
		gStations = E('g',{'clip-path': "url(#bottom_dwellers_"+freq+")", id:'Stations_'+freq},null,'SVG');
		gNoise = E('g',{id:'Noise_'+freq},null,'SVG');
		
		L.dom.append(gXaxis, [gStations,gNoise]);
		
		this.GetE('Defs_'+freq).appendChild(
				E('clipPath',{overflow:'hidden', clipPathUnits:'userSpaceOnUse', id:"noiseclipPath"+freq},null,'SVG') );
		this.GetE('Defs_'+freq).appendChild(
				E('clipPath',{overflow:'hidden', clipPathUnits:'userSpaceOnUse', id:"bottom_dwellers_"+freq},null,'SVG') );
		this.GetE('bottom_dwellers_'+freq).appendChild(
				 E('rect',{x: -50, y: 0, width: parseInt(gXaxis.getAttribute("width"))+200, height: tier_height-1, fill: "#111"},null,'SVG') );
		L.dom.append(svgChart, [E('rect',{x: -50, y: 0, width: 40, height: chart_height, fill: "#111"},null,'SVG'), gYaxis, gXaxis] );
		
		chan_analysis.sigInc = ( chan_analysis.offset_tbl[ '-120dBm' ] - chan_analysis.offset_tbl[ '0dBm' ] )/120;

		chan_analysis.tab.addEventListener('cbi-tab-active', L.bind(function(ev) {
			this.active_tab = ev.detail.tab;
		}, this));
	},

	handleScanRefresh: function() {
		if (!this.active_tab)
			return;

		var radioDev = this.radios[this.active_tab].dev,
		    table = this.radios[this.active_tab].table,
		    chan_analysis = this.radios[this.active_tab].graph,
		    tableTick = this.radios[this.active_tab].tableTick,
		    scanCache = this.radios[this.active_tab].scanCache,
		    textCache = this.radios[this.active_tab].textCache;
		    
		for (var chan in textCache) {
			textCache[chan] = { signalH: -255, bssidA: [] };
		}

		return Promise.all([
			radioDev.getScanList(),
			this.callInfo(radioDev.getName())
		]).then(L.bind(function(data) {
			var results = data[0],
			    local_wifi = data[1],
			    rows = [];
			    
			function initVendorVars(bssid, fuzzyOUIsearch) {
				var bOUI = bssid.replace(/:/g,'').slice(0,6);
				
				scanCache[bssid].color = random.derive_color(bssid);
				if (OUIdb) {
					if (scanCache[bssid].vendor == null) {
						scanCache[bssid].vendor = OUIdb[bOUI] ? OUIdb[bOUI] : 'unknown';
 						scanCache[bssid].fuzzyOUIs = fuzzyOUIsearch(bssid);
 						scanCache[bssid].parentDev = null;
 						scanCache[bssid].subSSIDs = [];
 					}
				}
			}

			for (var i = 0; i < results.length; i++) {
				if (scanCache[results[i].bssid] == null) {
					scanCache[results[i].bssid] = {};
					initVendorVars(results[i].bssid, this.fuzzyOUIsearch);
				}

				scanCache[results[i].bssid].data = results[i];
			}
			
			if (OUIdb) {
				for (var j in scanCache) { //CA:3A:6B:2D:20:06
					if (scanCache[j].vendor === 'unknown') {
						scanCache[j].subSSIDs = this.fuzzyMACsearch(scanCache, j);
					}
				}
			}
			
			if (local_wifi.hasOwnProperty('bssid')) {
				if (scanCache[local_wifi.bssid] == null) {
					scanCache[local_wifi.bssid] = {};
						initVendorVars(local_wifi.bssid, this.fuzzyOUIsearch);
				}

				scanCache[local_wifi.bssid].data = local_wifi;
			
				if (chan_analysis.offset_tbl[local_wifi.channel] != null && local_wifi.center_chan1) {
					var center_channels = [local_wifi.center_chan1],
						chan_width_text = local_wifi.htmode.replace(/(V)*HT/,''),
						chan_width = parseInt(chan_width_text)/10,
						bOUI = local_wifi.bssid.replace(/:/g,'').slice(0,6);

					if (local_wifi.center_chan2) {
						center_channels.push(local_wifi.center_chan2);
						chan_width = 8;
					}

					local_wifi.signal = -10;
					local_wifi.ssid = 'Local Interface';
				
					this.add_wifi_to_graph(this.active_tab, local_wifi, center_channels, chan_width);
					rows.push([
						this.render_signal_badge(q, local_wifi.signal),
						[
							E('span', { 'style': 'color:'+scanCache[local_wifi.bssid].color }, '⬤ '),
							local_wifi.ssid
						],
						'%d'.format(local_wifi.channel),
						'%h MHz'.format(chan_width_text),
						'%h'.format(local_wifi.mode),
						'%h'.format( (tableTick % 2 == 0 ? local_wifi.bssid : scanCache[local_wifi.bssid].vendor) )
					]);
				}
			}

			for (var k in scanCache) {
				if (scanCache[k].stale)
					results.push(scanCache[k].data);
				
				if (scanCache[k].subSSIDs && scanCache[k].subSSIDs.length) {
					for (var bs in scanCache[k].subSSIDs) {
						var tester = scanCache[k].subSSIDs[bs];
						if (scanCache[tester] && (scanCache[tester].vendor !== 'unknown' || 
								(scanCache[tester].ssid != null && scanCache[tester].fuzzyOUIs != [])) ) {
							scanCache[k].parentDev = tester;
						}
					}
				}
			}

			results.sort(function(a, b) {
				var diff = (b.quality - a.quality) || (a.channel - b.channel);

				if (diff)
					return diff;

				if (a.ssid < b.ssid)
					return -1;
				else if (a.ssid > b.ssid)
					return 1;

				if (a.bssid < b.bssid)
					return -1;
				else if (a.bssid > b.bssid)
					return 1;
			});

			for (var i = 0; i < results.length; i++) {
				var res = results[i],
					qv = res.quality || 0,
					qm = res.quality_max || 0,
					q = (qv > 0 && qm > 0) ? Math.floor((100 / qm) * qv) : 0,
					s = res.stale ? 'opacity:0.5' : '',
					center_channels = [res.channel],
					chan_width = 2,
					vendor = scanCache[res.bssid].vendor;

				/* Skip WiFi not supported by the current band */
				if (chan_analysis.offset_tbl[res.channel] == null)
					continue;

				res.channel_width = "20 MHz";
				if (res.ht_operation != null)
					if (res.ht_operation.channel_width == 2040) { /* 40 MHz Channel Enabled */
						if (res.ht_operation.secondary_channel_offset == "below") {
							res.channel_width = "40 MHz";
							chan_width = 4; /* 40 MHz Channel Used */
							center_channels[0] -= 2;
						} else if (res.ht_operation.secondary_channel_offset == "above") {
							res.channel_width = "40 MHz";
							chan_width = 4; /* 40 MHz Channel Used */
							center_channels[0] += 2;
						} else {
							res.channel_width = "20 MHz (40 MHz Intolerant)";
						}
					}

				if (res.vht_operation != null) {
					center_channels[0] = res.vht_operation.center_freq_1;
					if (res.vht_operation.channel_width == 80) {
						chan_width = 8;
						res.channel_width = "80 MHz";
					} else if (res.vht_operation.channel_width == 8080) {
						res.channel_width = "80+80 MHz";
						chan_width = 8;
						center_channels.push(res.vht_operation.center_freq_2);
					} else if (res.vht_operation.channel_width == 160) {
						res.channel_width = "160 MHz";
						chan_width = 16;
					}
				}

				this.add_wifi_to_graph(this.active_tab, res, center_channels, chan_width);
				
				if (scanCache[res.bssid].parentDev) {
					s+= ' font-style:italic';
					vendor='Multi-SSID ('+ scanCache[ scanCache[res.bssid].parentDev ].data.ssid +')';
				} else if (scanCache[res.bssid].vendor === 'unknown' && scanCache[res.bssid].fuzzyOUIs.length) {
					vendor='';
					for (var z=0; z<scanCache[res.bssid].fuzzyOUIs.length; z++) {
						vendor+='(?) ' + OUIdb[ scanCache[res.bssid].fuzzyOUIs[z] ] + ' (?)'
							+ (z+1 == scanCache[res.bssid].fuzzyOUIs.length ? '' : '\n');
					}
				}

				rows.push([
					E('span', { 'style': s }, this.render_signal_badge(q, res.signal)),
					E('span', { 'style': s }, [
						E('span', { 'style': 'color:'+scanCache[results[i].bssid].color }, '⬤ '),
						(res.ssid != null) ? '%h'.format(res.ssid) : E('em', _('hidden'))
					]),
					E('span', { 'style': s }, '%d'.format(res.channel)),
					E('span', { 'style': s }, '%h'.format(res.channel_width)),
					E('span', { 'style': s }, '%h'.format(res.mode)),
					E('span', { 'style': s }, '%h'.format( (tableTick % 2 == 0 ? res.bssid : vendor) ))
				]);

				res.stale = true;
			}
			this.spreadTextLabels();
			this.switch_BSSID_OUI();
			cbi_update_table(table, rows);
		}, this))
	},
	
	plotNoise: function(device, freq) {
		var chanArr = [], noiseArr = [],
			chanInc, xInc,
			nX, nY, prevX, prevY, 
			gNoise, gStations, noiseCE, noisePath,
			chan_analysis = this.radios[device].graph,
			band_data = this.radios[device].freqData[freq],
			sigMax = chan_analysis.offset_tbl[ '0dBm' ],		//5GHz = 0
			sigMin = chan_analysis.offset_tbl[ '-120dBm' ],		//5GHz = 238.6
 			sigInc = chan_analysis.sigInc;						//5GHz = 1.98
				
		function tranNs(ns) { return Math.abs(ns)*sigInc; }
		
		for (var f in band_data) {
			chanArr.push(band_data[f].chn);
			noiseArr.push(band_data[f].ns);
		}
		chanInc = chanArr[1]-chanArr[0];
		xInc = (chan_analysis.offset_tbl[ chanArr[1] ] - chan_analysis.offset_tbl[ chanArr[0] ])/chanInc;
		
		gNoise = this.GetE(('Noise_'+freq));
		gStations = this.GetE(('Stations_'+freq));
		noiseCE = this.GetE(('noiseclipPath'+freq));
		L.dom.empty(noiseCE);
		L.dom.empty(gNoise);
		
		for (var i=0; i<noiseArr.length; i++) {
			var nVal=noiseArr[i];
			if (!nVal) { nVal=-120; }
			if (nVal < -120) { nVal=-120; }
			if (nVal > 0) { nVal=0; }
			nX = chan_analysis.offset_tbl[ chanArr[i] ];
			nY = sigMax + tranNs(nVal);
			if (i == 0) {
				noisePath="M"+0+","+tranNs(nVal);
				prevY=nY;
			}
			
			if (nY == prevY) {
				noisePath+=" H"+nX;
			} else {
				noisePath+=" c"+(nX-prevX)/2+","+"0" /* x1,y1; x is 1/2 way to endpoint, no y-axis change */
					+","+(nX-prevX)/2+","+(nY-prevY) /* x2,y2 */
					+","+(nX-prevX)+","+(nY-prevY) /* endx,endy */
					+" ";
			}
			prevX=nX;
			prevY=nY;
		}
		noisePath+="H"+(nX+(chan_analysis.offset_tbl[ chanArr[1] ] - chan_analysis.offset_tbl[ chanArr[0] ]));
		
		L.dom.append(gNoise, [E('path',{d: noisePath, stroke: '#fff', 'stroke-width': 3, style: 'fill:transparent'},null,'SVG'), //stroke line
								E('path',{d: noisePath+"V"+tranNs(-120)+" H0", style: 'stroke:#fff; fill:#444; stroke-width:0; opacity:0.8'},null,'SVG')] ); //transparent fill
		
		noiseCE.appendChild( E('path',{d: noisePath+"V"+tranNs(0)+"H0V"+tranNs(-120)+"z", style: 'stroke:#fff; fill:#fff; stroke-width:0'},null,'SVG') );
	},
	
	callNetworkNoise: function(rdev, wnet) {
		var radioDev = this.radios[rdev].dev,
			chan_analysis = this.radios[rdev].graph,
			freqData = this.radios[rdev].freqData;
		
		return Promise.all([
			this.callSurvey(wnet).then(L.bind(function(wnet, data) {
				var freq;
				for (var achan in data) {
					for (var band in freqData) {
						var noise;
						if (Object.keys(freqData[band]).length) {
							freq = band;
							noise=data[achan].noise;
							noise >=0 ? noise-=255 : noise; //how likely is a noise of 140dBm???, thanks ubus thinking int8_t is boolean
							freqData[band][data[achan].mhz].ns = noise;
						}
					}
				}
				this.plotNoise(rdev,freq);
			}, this, wnet))
		]);
	},
	
	handleUCIRefresh: function() {
		var pref_noise_interval = parseInt(this.GetE('noise-interval').value),
			pref_dedicated_scan = ( this.GetE('dedicated-scan-wnet').checked ? '1' : '0' );
		
 		uci.set('luci', 'channel_analysis_r', 'scan_noise_interval', '%d'.format(pref_noise_interval));
 		uci.set('luci', 'channel_analysis_r', 'scan_dedicated_5G_network', pref_dedicated_scan);		

		uci.save();
		uci.changes().then(function(r) {
			ui.changes.renderChangeIndicator(r);
		})
	},
	
	suspendUCIpoll: function() {
		var GS = this.GetE('GSTab').settings;
		if (GS.ucipollFn) {
			poll.remove(GS.ucipollFn);
			GS.ucipollFn = null;
			poll.start();
		}
	},
	
	handleGS_Save: function() {
		var GS = this.GetE('GSTab').settings,
			pref_noise_interval = parseInt(this.GetE('noise-interval').value),
			pref_dedicated_scan = ( this.GetE('dedicated-scan-wnet').checked ? '1' : '0' );
		
 		uci.set('luci', 'channel_analysis_r', 'scan_noise_interval', '%d'.format(pref_noise_interval));
 		uci.set('luci', 'channel_analysis_r', 'scan_dedicated_5G_network', pref_dedicated_scan);		
		if (pref_noise_interval != GS.scan.noise_interval) {
			GS.scan.noise_interval = pref_noise_interval;
			poll.remove(GS.pollFn);
			poll.add(GS.pollFn, GS.scan.noise_interval);
			poll.start();
		}
		ui.showModal("Saving...",null);
		window.setTimeout(function() {document.body.classList.remove('modal-overlay-active')}, 800);
		return uci.apply().then(function(r) {ui.changes.renderChangeIndicator(0)});
	},
	
	handleGSTab: function() {
		var GS = this.GetE('GSTab').settings;
		if (!GS.ucipollFn) {
			GS.ucipollFn = L.bind(this.handleUCIRefresh, this);
			poll.add(GS.ucipollFn, 1);
			poll.start();
		}
	},
	
	channel_analysis_section: function() {
		return uci.sections('luci', 'internal').filter(function(sec) {
			return !sec['.anonymous'] && sec['.name'] === 'channel_analysis_r';
		});
	},

	radios : {},

	loadSVG : function(src) {
		return request.get(src).then(function(response) {
			if (!response.ok)
				throw new Error(response.statusText);

			return E('div', {
				'id': 'channel_graph',
				'style': 'width:100%;height:800px;margin-bottom:16px;background:#222'
			}, E(response.text()));
		});
	},

	load: function() {
		uci.load('luci');
		return Promise.all([
			this.loadSVG(L.resource('svg/channel_analysis_NEW2.svg')),
			network.getWifiDevices().then(L.bind(function(data) {
				var tasks = [], ret = [];

				for (var i = 0; i < data.length; i++) {
					ret[data[i].getName()] = { dev : data[i] };

					tasks.push(this.callFrequencyList(data[i].getName())
					.then(L.bind(function(radio, data) {
						ret[radio.getName()].freq = data;
					}, this, data[i])));
				}

				return Promise.all(tasks).then(function() { return ret; })
			}, this)),
			this.genOUIvar(false)
		]);
	},

	render: function(data) {
		var svg = data[0],
		    wifiDevs = data[1],
		    OUI_db_FS = data[2];

		var v = E('div', {}, E('div')),
			settings_tab,
			settings = {
				pollFn: null,
				ucipollFn: null,
				scan: {
					dedicated5Gnetwork: false,
					noise_interval: 30 }
			};
			
		if (this.channel_analysis_section().length) {
			settings.scan.dedicated5Gnetwork = ( uci.get('luci', 'channel_analysis_r', 'scan_dedicated_5G_network') === '1' ? true : false );
			settings.scan.noise_interval = parseInt(uci.get('luci', 'channel_analysis_r', 'scan_noise_interval'));
		} else {
			uci.add('luci', 'internal', 'channel_analysis_r');
 			uci.set('luci', 'channel_analysis_r', 'scan_noise_interval', '%d'.format(settings.scan.noise_interval));
 			uci.set('luci', 'channel_analysis_r', 'scan_dedicated_5G_network', ( settings.scan.dedicated5Gnetwork  ? '1' : '0') );
		}
		
		for (var ifname in wifiDevs) {
			var freq_tbl = {
					['2.4GHz'] : { },
					['5GHz'] : { },
				};

			/* Split FrequencyList in Bands */
			wifiDevs[ifname].freq.forEach(function(freq) {
				if (freq.mhz >= 5000) {
					freq_tbl['5GHz'][freq.mhz] = {chn:freq.channel, ns:-255};
				} else {
					freq_tbl['2.4GHz'][freq.mhz] = {chn:freq.channel, ns:-255};
				}
			});
			
			for (var freq in freq_tbl) {
				if (!Object.keys(freq_tbl[freq]).length)
					continue;

				var csvg = svg.cloneNode(true),
					svg_objs = csvg.firstElementChild,
					table = E('table', { 'class': 'table' }, [
						E('tr', { 'class': 'tr table-titles' }, [
							E('th', { 'class': 'th col-2 middle center' }, _('Signal')),
							E('th', { 'class': 'th col-4 middle left' }, _('SSID')),
							E('th', { 'class': 'th col-1 middle center hide-xs' }, _('Channel')),
							E('th', { 'class': 'th col-2 middle center' }, _('Channel Width')),
							E('th', { 'class': 'th col-2 middle left hide-xs' }, _('Mode')),
							E('th', { 'class': 'th col-4 middle center hide-xs', 'id': 'BSSID'+freq }, _('BSSID'))
						])
					]),
					tab = E('div', { 'data-tab': ifname+freq, 'data-tab-title': ifname+' ('+freq+')', 'frequency': freq },
							[E('br'),csvg,E('br'),table,E('br'),E('div', { 'class': 'tr.cbi-section-table-descr', 'style': 'font-style:italic'},
								_('Cell in italics denotes Multi-SSID broadcasts.'))]),
					graph_data = {
						graph: csvg,
						offset_tbl: {},
						col_width: 0,
						tab: tab,
						sigInc: 0
					};

				this.radios[ifname+freq] = {
					dev: wifiDevs[ifname].dev,
					graph: graph_data,
					table: table,
					tableTick: 0,
					freqData: freq_tbl,
					scanCache: {},
					textCache: {}
				};
				
				tab.addEventListener('cbi-tab-active', L.bind(this.suspendUCIpoll, this));
				
				//super manual traverse to get this minimal text up before setting up labels & waiting on scan results
				svg_objs=svg_objs.firstElementChild;  //<svg> graph
				svg_objs=svg_objs.firstElementChild;  //<defs> element
				svg_objs.id="Defs_"+freq;
				svg_objs=svg_objs.nextElementSibling; //<text> element
				if (freq == '2.4GHz') {
					csvg.style.height = "400px";
					svg_objs.setAttribute('dy',".83em");
				} else if (freq == '5GHz') {
					svg_objs.style.fontSize = "640px";
					svg_objs.setAttribute('dy',".95em");
				}
				svg_objs.innerHTML=freq.split("Hz")[0];
				svg_objs=svg_objs.nextElementSibling; //<svg> element
				svg_objs=svg_objs.firstElementChild; //<g> group element that should have a unique ID
				svg_objs.id=svg_objs.id+freq;

				cbi_update_table(table, [], E('em', { class: 'spinning' }, _('Starting wireless scan...')));

				v.firstElementChild.appendChild(tab);

				requestAnimationFrame(L.bind(this.create_channel_graph, this, graph_data, freq));
				
				if (wifiDevs[ifname].dev._ubusdata.dev.interfaces) {
					for (var wif in wifiDevs[ifname].dev._ubusdata.dev.interfaces) {
						//this ifname (network) != the tab ifname (device)
						var wnetIfname = wifiDevs[ifname].dev._ubusdata.dev.interfaces[wif].ifname;
						
						this.pollFn = L.bind(this.callNetworkNoise, this, (ifname+freq), wnetIfname);
						
						settings.pollFn = this.pollFn;
						poll.add(this.pollFn, settings.scan.noise_interval);
						poll.start();
					}
				}
			}
		}
		settings_tab = E('div', { 'data-tab': 'settings', 'data-tab-title': _('General settings'), 'id': 'GSTab' }, [
			E('h3', {},  _('OUI Vendor Database')),
			E('p', {},  _('The OUI db matches BSSID first 3 octets (XX:XX:XX) to a vendor. BSSID table column alternates with "Vendors"')),
			E('h3', {},  _('OUI db Status')),
			E('p', {'id': 'OUI_info'}, ( typeof OUI_db_FS !== "undefined" ? this.infoOUIdb(OUI_db_FS) : _("NOT PRESENT<br>") )),
			E('h3', {},  _('OUI Actions')),
			E('button', { 'class': 'cbi-button cbi-button-action', 'id': 'OUI_Get_button', 'click': L.bind(this.handleDownloadOUIdb, this),
					'disabled': Object.keys(OUIdb).length ? true : null }, _('Download OUI db.')),
			E('button', { 'class': 'cbi-button cbi-button-action', 'id': 'OUI_Upd_button', 'click': L.bind(this.handleUpdateOUIdb, this),
					'disabled': Object.keys(OUIdb).length ? null : true }, _('Update OUI db.')),
			E('button', { 'class': 'cbi-button cbi-button-action', 'id': 'OUI_Del_button', 'click': L.bind(this.handleDeleteOUIdb, this),
					'disabled': Object.keys(OUIdb).length  ? null : true}, _('Delete OUI db.')),
			E('hr'),
			E('h3', {},  _('Scan Behavior')),
			E('p', {},  _('Use dedicated scan0 network for 5GHz.')),
			E('div', {}, [
				E('label', { 'class': 'cbi-checkbox',}, [
					E('input', { 'id': 'dedicated-scan-wnet', 'type': 'checkbox', 'checked': settings.scan.dedicated5Gnetwork}), /* uci setting */
					E('label', { 'for': 'overwrite-cb' }), ' ',_('Use dedicated scan0 wireless network'),
					E('br'),
					E('span', { 'class': 'cbi-value-description'}, _('Existing wireless network will be taken down for scan & restored when "Cancel Scan" button is clicked.'))
				])
			]),
			E('br'),
			E('h3', {},  _('Noise Scan Behavior')),
			E('p', {},  _('Set interval for noise scan in active network')),
			E('input', { 'class': 'cbi-input-text', 'id': 'noise-interval', 'text': 'text', 'value': settings.scan.noise_interval}), /*uci setting*/
			E('span', { 'class': 'cbi-value-description'}, _('(in seconds)')),
			E('br'),
			E('br'),
			E('div', { 'class': 'cbi-page-actions' }, [
				E('button', { 'class': 'cbi-button cbi-button-save', 'click': L.bind(this.handleGS_Save, this)}, [ _('Save') ])
			])
		]);
		
		v.firstElementChild.appendChild( settings_tab );
		ui.tabs.initTabGroup(v.firstElementChild.childNodes);
		ui.changes.init;
		settings_tab.settings = settings;
		settings_tab.addEventListener('cbi-tab-active', L.bind(this.handleGSTab, this));

		this.pollFn = L.bind(this.handleScanRefresh, this);

		poll.add(this.pollFn);
		poll.start();

		return v;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
