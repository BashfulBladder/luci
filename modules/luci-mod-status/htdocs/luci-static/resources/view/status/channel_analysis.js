'use strict';
'require view';
'require poll';
'require request';
'require network';
'require ui';
'require rpc';
'require tools.prng as random';

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
	
	SetAtr: function(E,at,val) {E.setAttribute(at,val)},
	ApndCh: function(E,ch) {E.appendChild(ch)},
	NewE: function(type) {return document.createElementNS("http://www.w3.org/2000/svg",type)},
	GetE: function(ID) {return document.getElementById(ID)},
 	SetE: function(E, arr) {
 		for(var i=0;i<arr.length;i++) {
 			this.SetAtr(E,arr[i][0],arr[i][1]);
 		}
 	},
 	AddCh: function(p,arr) {
 		for(var i=0;i<arr.length;i++) {
 			this.ApndCh(p,arr[i]);
 		}
 	},
 	EmptyE: function(ID) {
 		var E = this.GetE(ID);
 		var ch = E.firstElementChild;
 		while (ch) {
 			ch.remove();
 			ch = E.firstElementChild;
 		}
 	},
 	
 	GenLineE: function(x1,x2,y1,y2,lID,strok) {
 		var aL=this.NewE("line");
 		this.SetE(aL,[ ['x1',x1],["x2",x2],["y1",y1],["y2",y2],["stroke",strok||""] ]);
 		aL.id=lID||"";
 		return aL;
 	},
 	GenRectE: function(fill,x_loc,y_loc,r_w,r_h,xrad,yrad) {
 		var aR=this.NewE("rect");
 		this.SetE(aR,[ ['fill',fill],["x",x_loc],["y",y_loc],["width",r_w],["height",r_h],["rx",xrad||0],["ry",yrad||0] ]);
 		return aR;
 	},
 	GenPathE: function(strok,stk_w,apath,fillC) {
 		var aP=this.NewE("path");
 		this.SetE(aP,[ ['stroke',strok],['stroke-width',stk_w],['d',apath] ]);
 		this.SetAtr(aP,"style",("fill:"+fillC||"none"));
 		return aP;
 	},
 	GenTextE: function(xloc,yloc,trans_vars,anchor,content,fsize,fstyle) {
 		var tE=this.NewE("text");
 		this.SetE(tE,[ ["x",xloc],["y",yloc],["transform",trans_vars],["text-anchor",anchor],["font-size",fsize||""],
 			["style",fstyle||""] ]);
 		tE.textContent=content;
 		return tE
 	},
 	GenClipE: function(cID) {
 		var cpE=this.NewE("clipPath");
 		this.SetE(cpE,[ ['overflow','hidden'],['clipPathUnits','userSpaceOnUse'] ]);
 		cpE.id=cID||"";
 		return cpE;
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

	add_wifi_to_graph: function(device, res, channels, channel_width) {
		if (!this.active_tab)
			return;

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
		
		chanInc = chanArr[1]-chanArr[0];
		xInc = chan_analysis.col_width/chanInc;
		
		if (scanCache[res.bssid].color == null)
 			scanCache[res.bssid].color = random.derive_color(res.bssid);
 		if (scanCache[res.bssid].graph == null)
 			scanCache[res.bssid].graph = [];
 			
  		//first channel is always master, where the label should be.
 		//it might be safe to assume that if channel_width > 4, then there are special actions needed  vis-a-vis channels & xWidth
 			
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
		
		if (scanCache[res.bssid].graph[i] != null) {
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
		if (scanCache[res.bssid].graph[i] != null && res.signal != oldSignal) {
			this.EmptyE(res.bssid);
		}
		//BAFFLED: where is this i being set?? AND why is always == 2 (in both 2.4GHz & 5GHz)
		if (scanCache[res.bssid].graph[i] == null || res.signal != oldSignal) {
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
			wifiE=this.GenPathE(scanCache[res.bssid].color,3,wPath,'none'); //signal line
			wifiE.id=res.bssid+"_"+res.signal;
			wifiFE=this.GenPathE('none',0,wPath+"z",scanCache[res.bssid].color); //signal fill
			wifiFE.style.opacity=0.3;
			if (noiseCE!=null) {
				if (noiseCE.firstElementChild != null) {
					this.SetAtr(wifiE,"clip-path","url(#noiseclipPath"+freq+")"); //applies the noise floor clipPath to the signal stroke
				}
			}
			wifiGroup = this.GetE(res.bssid);
			if (!wifiGroup) {
				wifiGroup = this.NewE("g");
				wifiGroup.id=res.bssid;
			}
			wifiTE = this.GenTextE(xCenter,signal-8,"","middle",res.ssid || res.bssid,"14px","fill:"+scanCache[res.bssid].color);
			wifiTE.id=res.bssid+"_tE";
			this.AddCh(wifiGroup,[wifiE,wifiFE,wifiTE]);
			this.ApndCh(gStations,wifiGroup);

			scanCache[res.bssid].graph[i] = { group : wifiGroup, line : wifiE, text : wifiTE };
		}
		scanCache[res.bssid].graph[i].group.style.zIndex = res.signal*-1;
		scanCache[res.bssid].graph[i].group.style.opacity = res.stale ? '0.5' : null;
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
						this.SetAtr(celltE,'y', abelH-(b*aLblH) );
					}
				}
			}
		}
	},

	create_channel_graph: function(chan_analysis, freq) {
		var tiers = [], chan_list = [], chart_section_loc = [],
			channel_incr, max_chan_in_tier, viewbox, channel_width, tier_height,
			t_start = 0, ch_gap = 0, sec_start = 0, chart_padding = 50, tier_padding = 28,
			band_data = this.radios[chan_analysis.tab.getAttribute('data-tab')].freqData[freq],
			textCache = this.radios[chan_analysis.tab.getAttribute('data-tab')].textCache,
			svgChart = this.GetE('chartarea'+freq),
			chart_height = parseInt(chan_analysis.graph.style.height.replace("px", "")),
			chart_width = chan_analysis.tab.getBoundingClientRect().width, //940
			plot_width = chart_width-chart_padding,
 			gYaxis = this.NewE("g"), gNoise = this.NewE("g"), gStations = this.NewE("g"),
 			gXaxis = this.NewE("symbol");
			
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
		channel_width = plot_width/(max_chan_in_tier+1); //padding
		chan_analysis.col_width = channel_width;
		tier_height = (chart_height-(tier_padding*tiers.length)) / tiers.length;
		
		gXaxis.id="Chart_XLabels"+freq;
		gXaxis.setAttribute("width", (chan_list.length + ch_gap + tiers.length)*channel_width);
						 
		for (var i=0; i<chan_list.length; i++) {
			var ch_transl;
			var gchannel=this.NewE("g");
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
			this.SetAtr(gchannel,"transform","translate("+ch_transl+",3)");
		
			this.ApndCh(gchannel,this.GenTextE(0,tier_height+16,"","middle",chan_list[i],"18px","fill:#999"));
			this.ApndCh(gchannel,this.GenLineE(0,0,0,tier_height,"","#666"));
			this.ApndCh(gXaxis,gchannel);
		}
		
		for (var t=0; t< tiers.length; t++) {
			var gTier=this.NewE("g"), XcloneU=this.NewE("use");
			for (var j=0; j>=-120; j-=10) {
				var y_height = (tier_height+tier_padding)*t + (tier_height/120)*Math.abs(j);
				if (t==0) {
					chan_analysis.offset_tbl[ j+"dBm" ] = y_height;
				}
				this.AddCh(gTier,[this.GenTextE(-20,y_height+5,"","end",j,"11px","fill:#999"),
									this.GenLineE(-10,-16,y_height+2,y_height+2,"","#999")]);
			}
			this.ApndCh(gYaxis,gTier);
			this.SetAtr(XcloneU,"transform","translate(-20,"+((tier_height+tier_padding)*t)+")");
			XcloneU.setAttributeNS(null, "href", "#Chart_XLabels"+freq);
			XcloneU.setAttribute("x", -(chart_section_loc[t][0]+25));
			XcloneU.setAttribute("width", (chart_section_loc[t][1]+chart_section_loc[t][0]+75));
			this.ApndCh(svgChart,XcloneU);
		}
		
		gStations.id='Stations_'+freq;
		gNoise.id='Noise_'+freq;
		this.AddCh(gXaxis,[gStations,gNoise]);
		this.ApndCh(this.GetE('Defs_'+freq), this.GenClipE("noiseclipPath"+freq));
		this.ApndCh(this.GetE('Defs_'+freq), this.GenClipE("bottom_dwellers_"+freq));
		this.ApndCh(this.GetE('bottom_dwellers_'+freq), this.GenRectE("#111",-50,0, parseInt(gXaxis.getAttribute("width"))+200 ,tier_height-1) );
		this.SetAtr(gStations,"clip-path","url(#bottom_dwellers_"+freq+")");
		this.AddCh(svgChart,[this.GenRectE("#111",-50,0,40,chart_height),gYaxis,gXaxis]); //[hiding rectangle, X labels, Y labels]
		
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

			for (var i = 0; i < results.length; i++) {
				if (scanCache[results[i].bssid] == null) {
					scanCache[results[i].bssid] = {};
					scanCache[results[i].bssid].color = random.derive_color(results[i].bssid);
				}

				scanCache[results[i].bssid].data = results[i];
			}

			if (scanCache[local_wifi.bssid] == null) {
				scanCache[local_wifi.bssid] = {};
			}

			scanCache[local_wifi.bssid].data = local_wifi;
			
			if (chan_analysis.offset_tbl[local_wifi.channel] != null && local_wifi.center_chan1) {
				var center_channels = [local_wifi.center_chan1],
				    chan_width_text = local_wifi.htmode.replace(/(V)*HT/,''),
				    chan_width = parseInt(chan_width_text)/10;

				if (local_wifi.center_chan2) {
					center_channels.push(local_wifi.center_chan2);
					chan_width = 8;
				}

				local_wifi.signal = -10;
				local_wifi.ssid = 'Local Interface';
				scanCache[local_wifi.bssid].color = random.derive_color(local_wifi.bssid);
				
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
					'%h'.format(local_wifi.bssid)
				]);
			}

			for (var k in scanCache)
				if (scanCache[k].stale)
					results.push(scanCache[k].data);

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
					chan_width = 2;

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

				rows.push([
					E('span', { 'style': s }, this.render_signal_badge(q, res.signal)),
					E('span', { 'style': s }, [
						E('span', { 'style': 'color:'+scanCache[results[i].bssid].color }, '⬤ '),
						(res.ssid != null) ? '%h'.format(res.ssid) : E('em', _('hidden'))
					]),
					E('span', { 'style': s }, '%d'.format(res.channel)),
					E('span', { 'style': s }, '%h'.format(res.channel_width)),
					E('span', { 'style': s }, '%h'.format(res.mode)),
					E('span', { 'style': s }, '%h'.format(res.bssid))
				]);

				res.stale = true;
			}
			this.spreadTextLabels();
			cbi_update_table(table, rows);
		}, this))
	},
	
	plotNoise: function(device, freq) {
		var chanArr = [], noiseArr = [],
			chanInc, xInc,
			nX, nY, prevX, prevY, 
			gNoise, gStations, noiseCE, noisePE, noiseFE, noisePath,
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
		this.EmptyE(("noiseclipPath"+freq));
		this.EmptyE(('Noise_'+freq));
		
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
		
		noisePE=this.GenPathE("#fff",3,noisePath,"transparent");
		noiseFE=this.GenPathE("#fff",0,noisePath+"V"+tranNs(-120)+" H0","#444");
		noiseFE.style.opacity=0.8;
		
		this.AddCh(gNoise,[noisePE,noiseFE]);		
		this.ApndCh(noiseCE,this.GenPathE("#fff",0,noisePath+"V"+tranNs(0)+"H0V"+tranNs(-120)+"z","#fff"));
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
			}, this))
		]);
	},

	render: function(data) {
		var svg = data[0],
		    wifiDevs = data[1];

		var v = E('div', {}, E('div'));

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
				table = E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th col-2 middle center' }, _('Signal')),
						E('th', { 'class': 'th col-4 middle left' }, _('SSID')),
						E('th', { 'class': 'th col-2 middle center hide-xs' }, _('Channel')),
						E('th', { 'class': 'th col-3 middle left' }, _('Channel Width')),
						E('th', { 'class': 'th col-2 middle left hide-xs' }, _('Mode')),
						E('th', { 'class': 'th col-3 middle left hide-xs' }, _('BSSID'))
					])
				]),
				tab = E('div', { 'data-tab': ifname+freq, 'data-tab-title': ifname+' ('+freq+')', 'frequency': freq },
						[E('br'),csvg,E('br'),table,E('br')]),
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
					freqData: freq_tbl,
					scanCache: {},
					textCache: {}
				};
				
				//super manual traverse to get this minimal text up before setting up labels & waiting on scan results
				var svg_objs = csvg.firstElementChild;
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

				v.firstElementChild.appendChild(tab)

				requestAnimationFrame(L.bind(this.create_channel_graph, this, graph_data, freq));
				
				if (wifiDevs[ifname].dev._ubusdata.dev.interfaces) {
					for (var wif in wifiDevs[ifname].dev._ubusdata.dev.interfaces) {
						//this ifname (network) != the tab ifname (device)
						var wnetIfname = wifiDevs[ifname].dev._ubusdata.dev.interfaces[wif].ifname;
						
						this.pollFn = L.bind(this.callNetworkNoise, this, (ifname+freq), wnetIfname);
						
						poll.add(this.pollFn, 30);
						poll.start();
					}
				}
			}
		}

		ui.tabs.initTabGroup(v.firstElementChild.childNodes);

		this.pollFn = L.bind(this.handleScanRefresh, this);

		poll.add(this.pollFn);
		poll.start();

		return v;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
