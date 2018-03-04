$(function () {
    'use strict'

    /* Settings. */

    const showSearchMarker = false // Show a marker on the map's scan location. Default: false.
    const isSearchMarkerMovable = false // Let the user move the scan location marker around. Doesn't do anything without --no-fixed-location. Default: false.
    const showLocationMarker = true // Show a marker on the visitor's location. Default: false.
    const isLocationMarkerMovable = false // Let the user move the visitor marker around. Default: false.
    const scaleByRarity = true // Enable scaling by rarity. Default: true.
    const upscalePokemon = false // Enable upscaling of certain Pokemon (upscaledPokemon and notify list). Default: false.
    const upscaledPokemon = [] // Add Pomon IDs separated by commas (e.g. [1, 2, 3]) to upscale icons. Default: [].
    const minZoomLevel = 13 // Minimum Zoom level (0-20) the map can have (Restricts how far the user can zoom out). Default: null.
    const maxZoomLevel = null // Maximum Zoom level (0-20) (how close the user can zoom in). Default: null.
    const mapBounds = [ // Boundaries of the viewable map
        [49.957193, 10.985878], // Top-Left corner
        [49.852362, 10.837129]  // Bottom-Right corner
    ]

    // Google Analytics property ID. Leave empty to disable.
    // Looks like 'UA-XXXXX-Y'.
    const analyticsKey = 'UA-114995883-1'

    // MOTD.
    const motdEnabled = true
    const motdTitle = 'MOTD'
    const motd = 'Hi there! This is an easily customizable MOTD with optional title!'

    // Only show every unique MOTD message once. If disabled, the MOTD will be
    // shown on every visit. Requires support for localStorage.
    // Updating only the MOTD title (and not the text) will not make the MOTD
    // appear again.
    const motdShowOnlyOnce = true

    // What pages should the MOTD be shown on? By default, homepage and mobile
    // pages.
    const motdShowOnPages = [
        '/',
        '/mobile'
    ]

    // Clustering! Different zoom levels for desktop vs mobile.
    const disableClusters = false // Default: false.
    const maxClusterZoomLevel = 14 // Default: 14.
    const maxClusterZoomLevelMobile = 14 // Default: 14.
    const clusterZoomOnClick = false // Default: false.
    const clusterZoomOnClickMobile = false // Default: false.
    const clusterGridSize = 60 // Default: 60.
    const clusterGridSizeMobile = 60 // Default: 60.

    // Process Pokemon in chunks to improve responsiveness.
    const processPokemonChunkSize = 100 // Default: 100.
    const processPokemonIntervalMs = 100 // Default: 100ms.
    const processPokemonChunkSizeMobile = 100 // Default: 100.
    const processPokemonIntervalMsMobile = 100 // Default: 100ms.


    /* Feature detection. */

    const hasStorage = (function () {
        var mod = 'RocketMap'
        try {
            localStorage.setItem(mod, mod)
            localStorage.removeItem(mod)
            return true
        } catch (exception) {
            return false
        }
    }())


    /* Do stuff. */
    const currentPage = window.location.pathname
    // Marker cluster might have loaded before custom.js.
    const isMarkerClusterLoaded = typeof window.markerCluster !== 'undefined' && !!window.markerCluster

    // Set custom Store values.
    Store.set('maxClusterZoomLevel', maxClusterZoomLevel)
    Store.set('clusterZoomOnClick', clusterZoomOnClick)
    Store.set('clusterGridSize', clusterGridSize)
    Store.set('processPokemonChunkSize', processPokemonChunkSize)
    Store.set('processPokemonIntervalMs', processPokemonIntervalMs)
    Store.set('scaleByRarity', scaleByRarity)
    Store.set('upscalePokemon', upscalePokemon)
    Store.set('upscaledPokemon', upscaledPokemon)
    Store.set('showSearchMarker', showSearchMarker)
    Store.set('isSearchMarkerMovable', isSearchMarkerMovable)
    Store.set('showLocationMarker', showLocationMarker)
    Store.set('isLocationMarkerMovable', isLocationMarkerMovable)

    if (typeof window.orientation !== 'undefined' || isMobileDevice()) {
        Store.set('maxClusterZoomLevel', maxClusterZoomLevelMobile)
        Store.set('clusterZoomOnClick', clusterZoomOnClickMobile)
        Store.set('clusterGridSize', clusterGridSizeMobile)
        Store.set('processPokemonChunkSize', processPokemonChunkSizeMobile)
        Store.set('processPokemonIntervalMs', processPokemonIntervalMsMobile)
    }

    if (disableClusters) {
        Store.set('maxClusterZoomLevel', -1)

        if (isMarkerClusterLoaded) {
            window.markerCluster.setMaxZoom(-1)
        }
    }

    // Map zoom setup.
    const bounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(mapBounds[1][0], mapBounds[1][1]), 
        new google.maps.LatLng(mapBounds[0][0], mapBounds[0][1])
    )

    map.addListener('center_changed', function() {
        // don't do anything if still inside bounds
        if (bounds.contains(map.getCenter())) {
            return
        }


        // create an error message to inform the user
        toastr.error("You can't view unscanned areas!", "Out of bounds!", {'preventDuplicates': true})

        var center = map.getCenter(),
            x = center.lat(),
            y = center.lng(),
            maxX = bounds.getNorthEast().lat(),
            maxY = bounds.getNorthEast().lng(),
            minX = bounds.getSouthWest().lat(),
            minY = bounds.getSouthWest().lng()

        // set new center coords to boundary edge coords
        if (x < minX) {x = minX}
        if (x > maxX) {x = maxX}
        if (y < minY) {y = minY}
        if (y > maxY) {y = maxY}

        map.panTo(new google.maps.LatLng(x, y))
    })

    map.setOptions({
        'minZoom': minZoomLevel,
        'maxZoom': maxZoomLevel
    })

    // Google Analytics.
    if (analyticsKey.length > 0) {
        window.ga = window.ga || function () {
            (ga.q = ga.q || []).push(arguments)
        }
        ga.l = Date.now
        ga('create', analyticsKey, 'auto')
        ga('send', 'pageview')
    }

    // Show MOTD.
    if (motdEnabled && motdShowOnPages.indexOf(currentPage) !== -1) {
        let motdIsUpdated = true

        if (hasStorage) {
            const lastMOTD = window.localStorage.getItem('lastMOTD') || ''

            if (lastMOTD === motd) {
                motdIsUpdated = false
            }
        }

        if (motdIsUpdated || !motdShowOnlyOnce) {
            window.localStorage.setItem('lastMOTD', motd)

            swal({
                title: motdTitle,
                text: motd
            })
        }
    }

    // Default Pokémon exclusion list
    const totalExcluded = Store.get('remember_select_exclude') // Retrieve what has already been set.

    const excludedPokemon = [10, 11, 13, 14, 16, 19, 21, 46, 161, 163, 165, 166, 167, 177, 183, 184, 187, 220, 261, 262, 263, 264, 265, 276, 293, 316, 17, 20, 309] // Add Pokemon IDs separated by commas (e.g. [1, 2, 3])

    // If the new default Pokemon doesn't exist then add it to the list.
    excludedPokemon.forEach((id) => {
        if (totalExcluded.indexOf(id) === -1) {
            totalExcluded.push(id)
        }
    })

    Store.set('remember_select_exclude', totalExcluded) // Tell the script to store the value to set it.

    // Disable spawnpoint & scanned location setting
    const switches = document.getElementsByClassName('form-control switch-container')
    const switchesToRemove = []

    Array.prototype.forEach.call(switches, (s) => {        
        var name = s.getElementsByTagName('h3')
        if (name.length == 1 && (name[0].innerHTML == "Spawn Points" || name[0].innerHTML == "Scanned Locations")) {
            switchesToRemove.push(s)
        }
    }) 

    switchesToRemove.forEach((s) => {
        s.parentNode.removeChild(s)
    })

    Store.set('showSpawnpoints', false)
    Store.set('showScanned', false)

    // Hide status link
    const labels = document.getElementsByClassName("label")

    Array.prototype.forEach.call(labels, (label) => {
        if (label.innerHTML == 'Status') {
            label.parentElement.style.display = 'none'
        }
    })


})
