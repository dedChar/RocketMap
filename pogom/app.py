#!/usr/bin/python
# -*- coding: utf-8 -*-

import calendar
import logging
import gc

from datetime import datetime
from s2sphere import LatLng
from bisect import bisect_left
from flask import Flask, abort, jsonify, render_template, request,\
    make_response, send_from_directory, session
from flask.json import JSONEncoder
from flask_compress import Compress

from .models import (Pokemon, Gym, Pokestop, ScannedLocation,
                     MainWorker, WorkerStatus, Token, HashKeys,
                     SpawnPoint, AuthKeys)
from .utils import (get_args, get_pokemon_name, get_pokemon_types,
                    now, dottedQuadToNum)
from .transform import transform_from_wgs_to_gcj
from .blacklist import fingerprints, get_ip_blacklist

from functools import wraps
from hashlib import sha256
from base64 import b64encode
from random import SystemRandom

import os, uuid

log = logging.getLogger(__name__)
compress = Compress()


cached_auth_keys = None
cached_time = None
temp_auth_keys = {}
key_assignments = {}

def require_authentication(func):
    @wraps(func)
    def check_key(*args, **kwargs):
        if 'temp_auth_key' in session:
            if session['temp_auth_key'] not in temp_auth_keys:
                abort(401)
            
            # Identify master key and check if the temp key is still valid
            master_hash = temp_auth_keys[session['temp_auth_key']]
            if master_hash in key_assignments and session['temp_auth_key'] in key_assignments[master_hash]:
                return func(*args, **kwargs)

            # Delete auth key from temp_auth_key dict and session
            temp_auth_keys[session['temp_auth_key']] = None
            session['temp_auth_key'] = None
        abort(401)
    return check_key

def gen_temp_key():
    # Generate a temporary key
    rand = SystemRandom()
    extra_chars = rand.choice([b'oS', b'pR', b'aZ', b'kI', b'eV', b'ml'])
    bits = rand.getrandbits(256)

    digest = sha256(str(bits).encode()).digest()
    
    return b64encode(digest, extra_chars)

def get_cached_keys(force=False):
    global cached_auth_keys
    global cached_time

    if cached_auth_keys is None or cached_time is None or (datetime.now() - cached_time).total_seconds() > 5 * 60 or force:
        cached_auth_keys = AuthKeys.get_keys_as_dict()
        cached_time = datetime.now()
        if force:
            log.info("Forced AuthKey cache update!")
        log.info("Updated AuthKey cache. New timestamp: " + str(cached_time))

    return cached_auth_keys

def add_temp_key(master_hash):
    # assign a new temp key to a master key
    
    global key_assignments
    global temp_auth_keys
    cached_keys = get_cached_keys()

    key_props = cached_keys[master_hash]
    if key_props['valid_until'] < datetime.now():
        log.debug("Key \"" + master_hash + "\" has expired.")
        return

    if master_hash not in key_assignments:
        key_assignments[master_hash] = []

    if len(key_assignments[master_hash]) >= key_props['max_sessions']:
        key_assignments[master_hash].pop()
    
    temp_key = gen_temp_key()

    temp_auth_keys[temp_key] = master_hash
    key_assignments[master_hash].insert(0, temp_key)
    return temp_key

def convert_pokemon_list(pokemon):
    args = get_args()
    # Performance:  disable the garbage collector prior to creating a
    # (potentially) large dict with append().
    gc.disable()

    pokemon_result = []
    for p in pokemon:
        p['pokemon_name'] = get_pokemon_name(p['pokemon_id'])
        p['pokemon_types'] = get_pokemon_types(p['pokemon_id'])
        p['encounter_id'] = str(p['encounter_id'])
        if args.china:
            p['latitude'], p['longitude'] = \
                transform_from_wgs_to_gcj(p['latitude'], p['longitude'])
        pokemon_result.append(p)

    # Re-enable the GC.
    gc.enable()
    return pokemon


class Pogom(Flask):

    def __init__(self, import_name, **kwargs):
        super(Pogom, self).__init__(import_name, **kwargs)
        compress.init_app(self)

        args = get_args()

        # Global blist
        if not args.disable_blacklist:
            log.info('Retrieving blacklist...')
            self.blacklist = get_ip_blacklist()
            # Sort & index for binary search
            self.blacklist.sort(key=lambda r: r[0])
            self.blacklist_keys = [
                dottedQuadToNum(r[0]) for r in self.blacklist
            ]
        else:
            log.info('Blacklist disabled for this session.')
            self.blacklist = []
            self.blacklist_keys = []

        # Routes
        self.json_encoder = CustomJSONEncoder
        self.route("/", methods=['GET'])(self.fullmap)
        self.route("/raw_data", methods=['GET'])(self.raw_data)
        self.route("/loc", methods=['GET'])(self.loc)
        self.route("/next_loc", methods=['POST'])(self.next_loc)
        self.route("/mobile", methods=['GET'])(self.list_pokemon)
        self.route("/search_control", methods=['GET'])(self.get_search_control)
        self.route("/search_control", methods=['POST'])(
            self.post_search_control)
        self.route("/stats", methods=['GET'])(self.get_stats)
        self.route("/status", methods=['GET'])(self.get_status)
        self.route("/status", methods=['POST'])(self.post_status)
        self.route("/gym_data", methods=['GET'])(self.get_gymdata)
        self.route("/bookmarklet", methods=['GET'])(self.get_bookmarklet)
        self.route("/inject.js", methods=['GET'])(self.render_inject_js)
        self.route("/submit_token", methods=['POST'])(self.submit_token)
        self.route("/get_stats", methods=['GET'])(self.get_account_stats)
        self.route("/robots.txt", methods=['GET'])(self.render_robots_txt)
        self.route("/serviceWorker.min.js", methods=['GET'])(
            self.render_service_worker_js)
        self.route("/authenticate", methods=['POST'])(self.authenticate)
        
        self.secret_key = os.environ.get('RM_SECRET_KEY', uuid.uuid4().hex)

    def render_robots_txt(self):
        return render_template('robots.txt')

    def render_service_worker_js(self):
        return send_from_directory('static/dist/js', 'serviceWorker.min.js')

    def get_bookmarklet(self):
        args = get_args()
        return render_template('bookmarklet.html',
                               domain=args.manual_captcha_domain)

    def render_inject_js(self):
        args = get_args()
        src = render_template('inject.js',
                              domain=args.manual_captcha_domain,
                              timer=args.manual_captcha_refresh)

        response = make_response(src)
        response.headers['Content-Type'] = 'application/javascript'

        return response

    def submit_token(self):
        response = 'error'
        if request.form:
            token = request.form.get('token')
            query = Token.insert(token=token, last_updated=datetime.utcnow())
            query.execute()
            response = 'ok'
        r = make_response(response)
        r.headers.add('Access-Control-Allow-Origin', '*')
        return r

    def get_account_stats(self):
        stats = MainWorker.get_account_stats()
        r = make_response(jsonify(**stats))
        r.headers.add('Access-Control-Allow-Origin', '*')
        return r

    def validate_request(self):
        args = get_args()

        # Get real IP behind trusted reverse proxy.
        ip_addr = request.remote_addr
        if ip_addr in args.trusted_proxies:
            ip_addr = request.headers.get('X-Forwarded-For', ip_addr)

        # Make sure IP isn't blacklisted.
        if self._ip_is_blacklisted(ip_addr):
            log.debug('Denied access to %s: blacklisted IP.', ip_addr)
            abort(403)

    def _ip_is_blacklisted(self, ip):
        if not self.blacklist:
            return False

        # Get the nearest IP range
        pos = max(bisect_left(self.blacklist_keys, ip) - 1, 0)
        ip_range = self.blacklist[pos]

        start = dottedQuadToNum(ip_range[0])
        end = dottedQuadToNum(ip_range[1])

        return start <= dottedQuadToNum(ip) <= end

    def set_control_flags(self, control):
        self.control_flags = control

    def set_heartbeat_control(self, heartb):
        self.heartbeat = heartb

    def set_location_queue(self, queue):
        self.location_queue = queue

    def set_current_location(self, location):
        self.current_location = location

    def get_search_control(self):
        return jsonify({
            'status': not self.control_flags['search_control'].is_set()})

    def post_search_control(self):
        args = get_args()
        if not args.search_control or args.on_demand_timeout > 0:
            return 'Search control is disabled', 403
        action = request.args.get('action', 'none')
        if action == 'on':
            self.control_flags['search_control'].clear()
            log.info('Search thread resumed')
        elif action == 'off':
            self.control_flags['search_control'].set()
            log.info('Search thread paused')
        else:
            return jsonify({'message': 'invalid use of api'})
        return self.get_search_control()

    def fullmap(self):
        self.heartbeat[0] = now()
        args = get_args()
        if args.on_demand_timeout > 0:
            self.control_flags['on_demand'].clear()

        search_display = (args.search_control and args.on_demand_timeout <= 0)
        scan_display = False if (args.only_server or args.fixed_location or
                                 args.spawnpoint_scanning) else True

        visibility_flags = {
            'gyms': not args.no_gyms,
            'pokemons': not args.no_pokemon,
            'pokestops': not args.no_pokestops,
            'raids': not args.no_raids,
            'gym_info': args.gym_info,
            'encounter': args.encounter,
            'scan_display': scan_display,
            'search_display': search_display,
            'fixed_display': not args.fixed_location,
            'custom_css': args.custom_css,
            'custom_js': args.custom_js
        }

        map_lat = self.current_location[0]
        map_lng = self.current_location[1]

        return render_template('map.html',
                               lat=map_lat,
                               lng=map_lng,
                               gmaps_key=args.gmaps_key,
                               lang=args.locale,
                               show=visibility_flags
                               )
    @require_authentication
    def raw_data(self):
        # Make sure fingerprint isn't blacklisted.
        fingerprint_blacklisted = any([
            fingerprints['no_referrer'](request),
            fingerprints['iPokeGo'](request)
        ])

        if fingerprint_blacklisted:
            log.debug('User denied access: blacklisted fingerprint.')
            abort(403)

        self.heartbeat[0] = now()
        args = get_args()
        if args.on_demand_timeout > 0:
            self.control_flags['on_demand'].clear()
        d = {}

        # Request time of this request.
        d['timestamp'] = datetime.utcnow()

        # Request time of previous request.
        if request.args.get('timestamp'):
            timestamp = int(request.args.get('timestamp'))
            timestamp -= 1000  # Overlap, for rounding errors.
        else:
            timestamp = 0

        swLat = request.args.get('swLat')
        swLng = request.args.get('swLng')
        neLat = request.args.get('neLat')
        neLng = request.args.get('neLng')

        oSwLat = request.args.get('oSwLat')
        oSwLng = request.args.get('oSwLng')
        oNeLat = request.args.get('oNeLat')
        oNeLng = request.args.get('oNeLng')

        # Previous switch settings.
        lastgyms = request.args.get('lastgyms')
        lastpokestops = request.args.get('lastpokestops')
        lastpokemon = request.args.get('lastpokemon')
        lastslocs = request.args.get('lastslocs')
        lastspawns = request.args.get('lastspawns')

        if request.args.get('luredonly', 'true') == 'true':
            luredonly = True
        else:
            luredonly = False

        # Current switch settings saved for next request.
        if request.args.get('gyms', 'true') == 'true':
            d['lastgyms'] = request.args.get('gyms', 'true')

        if request.args.get('pokestops', 'true') == 'true':
            d['lastpokestops'] = request.args.get('pokestops', 'true')

        if request.args.get('pokemon', 'true') == 'true':
            d['lastpokemon'] = request.args.get('pokemon', 'true')

        if request.args.get('scanned', 'true') == 'true':
            d['lastslocs'] = request.args.get('scanned', 'true')

        if request.args.get('spawnpoints', 'false') == 'true':
            d['lastspawns'] = request.args.get('spawnpoints', 'false')

        # If old coords are not equal to current coords we have moved/zoomed!
        if (oSwLng < swLng and oSwLat < swLat and
                oNeLat > neLat and oNeLng > neLng):
            newArea = False  # We zoomed in no new area uncovered.
        elif not (oSwLat == swLat and oSwLng == swLng and
                  oNeLat == neLat and oNeLng == neLng):
            newArea = True
        else:
            newArea = False

        # Pass current coords as old coords.
        d['oSwLat'] = swLat
        d['oSwLng'] = swLng
        d['oNeLat'] = neLat
        d['oNeLng'] = neLng

        if (request.args.get('pokemon', 'true') == 'true' and
                not args.no_pokemon):
            if request.args.get('ids'):
                ids = [int(x) for x in request.args.get('ids').split(',')]
                d['pokemons'] = convert_pokemon_list(
                    Pokemon.get_active_by_id(ids, swLat, swLng, neLat, neLng))
            elif lastpokemon != 'true':
                # If this is first request since switch on, load
                # all pokemon on screen.
                d['pokemons'] = convert_pokemon_list(
                    Pokemon.get_active(swLat, swLng, neLat, neLng))
            else:
                # If map is already populated only request modified Pokemon
                # since last request time.
                d['pokemons'] = convert_pokemon_list(
                    Pokemon.get_active(
                        swLat, swLng, neLat, neLng, timestamp=timestamp))
                if newArea:
                    # If screen is moved add newly uncovered Pokemon to the
                    # ones that were modified since last request time.
                    d['pokemons'] = d['pokemons'] + (
                        convert_pokemon_list(
                            Pokemon.get_active(
                                swLat,
                                swLng,
                                neLat,
                                neLng,
                                oSwLat=oSwLat,
                                oSwLng=oSwLng,
                                oNeLat=oNeLat,
                                oNeLng=oNeLng)))

            if request.args.get('eids'):
                # Exclude id's of pokemon that are hidden.
                eids = [int(x) for x in request.args.get('eids').split(',')]
                d['pokemons'] = [
                    x for x in d['pokemons'] if x['pokemon_id'] not in eids]

            if request.args.get('reids'):
                reids = [int(x) for x in request.args.get('reids').split(',')]
                d['pokemons'] = d['pokemons'] + (
                    convert_pokemon_list(
                        Pokemon.get_active_by_id(reids, swLat, swLng, neLat,
                                                 neLng)))
                d['reids'] = reids

        if (request.args.get('pokestops', 'true') == 'true' and
                not args.no_pokestops):
            if lastpokestops != 'true':
                d['pokestops'] = Pokestop.get_stops(swLat, swLng, neLat, neLng,
                                                    lured=luredonly)
            else:
                d['pokestops'] = Pokestop.get_stops(swLat, swLng, neLat, neLng,
                                                    timestamp=timestamp)
                if newArea:
                    d['pokestops'] = d['pokestops'] + (
                        Pokestop.get_stops(swLat, swLng, neLat, neLng,
                                           oSwLat=oSwLat, oSwLng=oSwLng,
                                           oNeLat=oNeLat, oNeLng=oNeLng,
                                           lured=luredonly))

        if request.args.get('gyms', 'true') == 'true' and not args.no_gyms:
            if lastgyms != 'true':
                d['gyms'] = Gym.get_gyms(swLat, swLng, neLat, neLng)
            else:
                d['gyms'] = Gym.get_gyms(swLat, swLng, neLat, neLng,
                                         timestamp=timestamp)
                if newArea:
                    d['gyms'].update(
                        Gym.get_gyms(swLat, swLng, neLat, neLng,
                                     oSwLat=oSwLat, oSwLng=oSwLng,
                                     oNeLat=oNeLat, oNeLng=oNeLng))

        if request.args.get('scanned', 'true') == 'true':
            if lastslocs != 'true':
                d['scanned'] = ScannedLocation.get_recent(swLat, swLng,
                                                          neLat, neLng)
            else:
                d['scanned'] = ScannedLocation.get_recent(swLat, swLng,
                                                          neLat, neLng,
                                                          timestamp=timestamp)
                if newArea:
                    d['scanned'] = d['scanned'] + ScannedLocation.get_recent(
                        swLat, swLng, neLat, neLng, oSwLat=oSwLat,
                        oSwLng=oSwLng, oNeLat=oNeLat, oNeLng=oNeLng)

        if request.args.get('seen', 'false') == 'true':
            d['seen'] = Pokemon.get_seen(int(request.args.get('duration')))

        if request.args.get('appearances', 'false') == 'true':
            d['appearances'] = Pokemon.get_appearances(
                request.args.get('pokemonid'),
                int(request.args.get('duration')))

        if request.args.get('appearancesDetails', 'false') == 'true':
            d['appearancesTimes'] = (
                Pokemon.get_appearances_times_by_spawnpoint(
                    request.args.get('pokemonid'),
                    request.args.get('spawnpoint_id'),
                    int(request.args.get('duration'))))

        if request.args.get('spawnpoints', 'false') == 'true':
            if lastspawns != 'true':
                d['spawnpoints'] = SpawnPoint.get_spawnpoints(
                    swLat=swLat, swLng=swLng, neLat=neLat, neLng=neLng)
            else:
                d['spawnpoints'] = SpawnPoint.get_spawnpoints(
                    swLat=swLat, swLng=swLng, neLat=neLat, neLng=neLng,
                    timestamp=timestamp)
                if newArea:
                    d['spawnpoints'] = d['spawnpoints'] + (
                        SpawnPoint.get_spawnpoints(
                            swLat, swLng, neLat, neLng,
                            oSwLat=oSwLat, oSwLng=oSwLng,
                            oNeLat=oNeLat, oNeLng=oNeLng))

        if request.args.get('status', 'false') == 'true':
            args = get_args()
            d = {}
            if args.status_page_password is None:
                d['error'] = 'Access denied'
            elif (request.args.get('password', None) ==
                  args.status_page_password):
                d['main_workers'] = MainWorker.get_all()
                d['workers'] = WorkerStatus.get_all()
        return jsonify(d)

    def loc(self):
        d = {}
        d['lat'] = self.current_location[0]
        d['lng'] = self.current_location[1]

        return jsonify(d)

    def next_loc(self):
        args = get_args()
        if args.fixed_location:
            return 'Location changes are turned off', 403
        lat = None
        lon = None
        # Part of query string.
        if request.args:
            lat = request.args.get('lat', type=float)
            lon = request.args.get('lon', type=float)
        # From post requests.
        if request.form:
            lat = request.form.get('lat', type=float)
            lon = request.form.get('lon', type=float)

        if not (lat and lon):
            log.warning('Invalid next location: %s,%s', lat, lon)
            return 'bad parameters', 400
        else:
            self.location_queue.put((lat, lon, 0))
            self.set_current_location((lat, lon, 0))
            log.info('Changing next location: %s,%s', lat, lon)
            return self.loc()

    def list_pokemon(self):
        # todo: Check if client is Android/iOS/Desktop for geolink, currently
        # only supports Android.
        pokemon_list = []

        # Allow client to specify location.
        lat = request.args.get('lat', self.current_location[0], type=float)
        lon = request.args.get('lon', self.current_location[1], type=float)
        origin_point = LatLng.from_degrees(lat, lon)

        for pokemon in convert_pokemon_list(
                Pokemon.get_active(None, None, None, None)):
            pokemon_point = LatLng.from_degrees(pokemon['latitude'],
                                                pokemon['longitude'])
            diff = pokemon_point - origin_point
            diff_lat = diff.lat().degrees
            diff_lng = diff.lng().degrees
            direction = (('N' if diff_lat >= 0 else 'S')
                         if abs(diff_lat) > 1e-4 else '') +\
                        (('E' if diff_lng >= 0 else 'W')
                         if abs(diff_lng) > 1e-4 else '')
            entry = {
                'id': pokemon['pokemon_id'],
                'name': pokemon['pokemon_name'],
                'card_dir': direction,
                'distance': int(origin_point.get_distance(
                    pokemon_point).radians * 6366468.241830914),
                'time_to_disappear': '%d min %d sec' % (divmod(
                    (pokemon['disappear_time'] - datetime.utcnow()).seconds,
                    60)),
                'disappear_time': pokemon['disappear_time'],
                'disappear_sec': (
                    pokemon['disappear_time'] - datetime.utcnow()).seconds,
                'latitude': pokemon['latitude'],
                'longitude': pokemon['longitude']
            }
            pokemon_list.append((entry, entry['distance']))
        pokemon_list = [y[0] for y in sorted(pokemon_list, key=lambda x: x[1])]
        args = get_args()
        visibility_flags = {
            'custom_css': args.custom_css,
            'custom_js': args.custom_js
        }

        return render_template('mobile_list.html',
                               pokemon_list=pokemon_list,
                               origin_lat=lat,
                               origin_lng=lon,
                               show=visibility_flags
                               )

    def get_stats(self):
        args = get_args()
        visibility_flags = {
            'custom_css': args.custom_css,
            'custom_js': args.custom_js
        }

        return render_template('statistics.html',
                               lat=self.current_location[0],
                               lng=self.current_location[1],
                               gmaps_key=args.gmaps_key,
                               show=visibility_flags
                               )

    def get_gymdata(self):
        gym_id = request.args.get('id')
        gym = Gym.get_gym(gym_id)

        return jsonify(gym)

    def get_status(self):
        args = get_args()
        visibility_flags = {
            'custom_css': args.custom_css,
            'custom_js': args.custom_js
        }
        if args.status_page_password is None:
            abort(404)

        return render_template('status.html',
                               show=visibility_flags)

    def post_status(self):
        args = get_args()
        d = {}
        if args.status_page_password is None:
            abort(404)

        if request.form.get('password', None) == args.status_page_password:
            d['login'] = 'ok'
            d['main_workers'] = MainWorker.get_all()
            d['workers'] = WorkerStatus.get_all()
            d['hashkeys'] = HashKeys.get_obfuscated_keys()
        else:
            d['login'] = 'failed'
        return jsonify(d)

    def authenticate(self):
        global temp_auth_keys
        cached_keys = get_cached_keys()

        key = request.form.get('password', None)
        if key is None:
            abort(401)
    
        key_hash = sha256(key).hexdigest()
        for i in range(2):
            if key_hash not in cached_keys:
                if i == 0:
                    cached_keys = get_cached_keys(True)
                elif i == 1:
                    log.debug("Key \"" + key_hash + "\" does not exist.")
                    abort(401)
            else:
                session['temp_auth_key'] = add_temp_key(key_hash)
                return "ok"

class CustomJSONEncoder(JSONEncoder):

    def default(self, obj):
        try:
            if isinstance(obj, datetime):
                if obj.utcoffset() is not None:
                    obj = obj - obj.utcoffset()
                millis = int(
                    calendar.timegm(obj.timetuple()) * 1000 +
                    obj.microsecond / 1000
                )
                return millis
            iterable = iter(obj)
        except TypeError:
            pass
        else:
            return list(iterable)
        return JSONEncoder.default(self, obj)
