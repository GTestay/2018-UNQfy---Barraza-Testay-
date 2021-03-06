const picklejs = require('picklejs');
const fs = require('fs');
const {aplanar, isNotUndefined, isNotEmpty} = require('./funcionesAuxiliares');
require('dotenv').config();

const {Artist, Album, Track, TrackList, Playlist} = require('./domain');
const {NotificacionApiRest, NotificadorUnqfy} = require('./notificacionUnqfy');

const {ArtistNotFoundException, AlbumNotFoundException, TrackNotFoundException} = require('./Excepciones');
const {Subject} = require('./observerPattern');
const {Spotify} = require('./Spotify');
const {MusixMatch} = require('./MusixMatch');

class UNQfy extends Subject {

  constructor() {
    super();
    this.idAlbum = 0;
    this.idArtist = 0;
    this.artists = [];
    this.playlists = [];
    this.lyricSearcher = new MusixMatch();
  }


  //Dado un nombre de artista, busca sus albumnes en spotify
  // y los guarda en él.
  populateAlbumsForArtist(artistName) {
    let artist;
    try {
      artist = this.getArtistByName(artistName);

    } catch (ArtistNotFoundException) {
      console.log('EL ARTISTA NO EXISTE');
    }
    const spotify = new Spotify();

    const promise = spotify.getArtistFromAPI(artist)
      .then(artist => {
        return spotify.getAlbumsFromArtist(artist.id);
      })
      .then(albums => {

          return this.addAlbumsToArtist(albums, artist);
        }
      )
      .catch(err => {
        console.log(err);
      });

    return promise;
  }

  //retorna la promesa de traer la letra de una canción.
  // retorna la canción con la letra.

  getLyricsFor(track) {

    console.log(' Cancion a buscar: ' + track);

    return this.lyricSearcher.searchLyricsFor(track)
      .then((lyric) => {
        track.lyrics = lyric;
        console.log(track);
        return track;
      })
      .catch(err => console.log(err));
  }


  addAlbumsToArtist(albums, artist) {

    return albums.forEach(album => this.addAlbumToArtist(artist, album));
  }

  // ADD METHODS

  /* Debe soportar al menos:
         params.name (string)
         params.country (string)
      */
  addArtist(params) {
    // El objeto artista creado debe soportar (al menos) las propiedades name (string) y country (string)
    const newArtist = new Artist(params.name, params.country, this.idForArtist());
    this.artists.push(newArtist);
    return newArtist;
  }

  /* Debe soportar al menos:
          params.name (string)
          params.year (number)
      */
  addAlbum(artistName, params) {
    // El objeto album creado debe tener (al menos) las propiedades name (string) y year
    const artist = this.getArtistByName(artistName);
    return this.addAlbumToArtist(artist, params);
  }

  addAlbumToArtist(artist, params) {
    const newAlbum = new Album(artist.name, params.name, params.year, this.idForAlbum());
    artist.addAlbum(newAlbum);

    const data = {};
    data.artist = artist;
    data.album = newAlbum;
    this.changed('Agregar Album', data);

    return newAlbum;
  }

  /* Debe soportar (al menos):
             params.name (string)
             params.duration (number)
             params.genres (lista de strings)
        */
  addTrack(albumName, params) {
    /* El objeto track creado debe soportar (al menos) las propiedades:
                 name (string),
                 duration (number),
                 genre (string)
            */
    const albumSearched = this.getAlbumByName(albumName);
    const newTrack = new Track(params.name, params.duration, params.genre, albumSearched.name);
    albumSearched.addTrack(newTrack);
  }

  addPlaylist(name, genresToInclude, maxDuration) {
    /* El objeto playlist creado debe soportar (al menos):
              * una propiedad name (string)
              * un metodo duration() que retorne la duración de la playlist.
              * un metodo hasTrack(aTrack) que retorna true si aTrack se encuentra en la playlist
            */
    let newPlaylist = new Playlist(name, genresToInclude, maxDuration);
    newPlaylist = this.putRandomTracksInPlaylist(newPlaylist);
    this.playlists.push(newPlaylist);
  }

  // REMOVE METHODS
  removeArtist(aName) {
    const artistToRemove = this.getArtistByName(aName);
    const data = {};
    data.artist = artistToRemove;
    this.changed('Baja Artista', data);

    const tracksToDelete = artistToRemove.albums.map(album => album.tracks);

    this.playlists.forEach(playlist => playlist.removeTracks(tracksToDelete));

    this.artists.splice(this.artists.indexOf(artistToRemove), 1);
  }


  removePlaylist(aName) {
    this.playlists = this.playlists.filter(playlist => playlist.name !== aName);
  }

  removeAlbum(aName) {
    const allTracksFromAlbum = aplanar(this.artists.map(a => a.tracksFromAlbum(aName)));

    this.artists.forEach(a => a.removeAlbum(aName));

    this.removeTracksFromPlaylist(allTracksFromAlbum);

  }

  removeTrack(aName) {
    this.removeTrackFromAlbum(aName);
    this.removeTrackFromPlaylist(aName);
  }

  removeTrackFromPlaylist(aName) {
    this.playlists.forEach(playlist => playlist.removeTrack(aName));
  }

  removeTracksFromPlaylist(allTracksFromAlbum) {
    this.playlists.forEach(p => p.removeTracks(allTracksFromAlbum));
  }

  removeTrackFromAlbum(aName) {
    this.allAlbums().forEach(album => album.removeTrack(aName));
  }


  listTracks() {
    return aplanar(this.allAlbums().map(album => album.tracks));
  }

  //SEARCH METHODS
  searchArtistByName(name) {
    return this.artists.filter(artist => artist.hasThisName(name));
  }


  searchAlbumByName(name) {
    return this.allAlbums().filter(album => album.hasThisName(name));
  }

  searchPlaylistByName(name) {
    return this.playlists.filter(playlist => playlist.name.includes(name));
  }

  searchTrackByName(name) {
    const tracks = this.listTracks();

    return tracks.filter(track => track.name.includes(name));
  }

  //GET 'SOMETHING' METHODS

  getTracksMatchingGenres(genres) {
    // Debe retornar todos los tracks que contengan alguno de los generos en el parametro genres

    const tracksFiltered = this.artists.map(artist => artist.tracksWithGenres(genres));

    return aplanar(tracksFiltered);

  }

  getTracksMatchingArtist(artistName) {

    const albums = this.allAlbums();
    const albumnsWithFilteredTracks = albums.filter(album => artistName.includes(album.artistName)).map(album => album.tracks);

    return aplanar(albumnsWithFilteredTracks);
  }

  getArtistBy(filter, valueError) {
    const artistSearched = this.artists.find(filter);
    if (isNotUndefined(artistSearched))
      return artistSearched;
    else
      throw new ArtistNotFoundException(valueError);
  }

  getArtistByName(name) {
    return this.getArtistBy(a => a.hasThisName(name), name);
  }

  getArtistById(id) {
    return this.getArtistBy(a => a.id == id, id);
  }


  getAlbumBy(filter, valueError) {
    const album = this.allAlbums().find(filter);
    if (isNotUndefined(album))
      return album;
    else
      throw new AlbumNotFoundException(valueError);
  }

  getAlbumByName(name) {
    return this.getAlbumBy(a => a.hasThisName(name), name);
  }

  getAlbumById(id) {
    return this.getAlbumBy(a => a.id == id, id);
  }


  getTrackBy(filter, valueError) {
    const track = this.allTracks().find(filter);
    if (isNotUndefined(track))
      return track;
    else
      throw new TrackNotFoundException(valueError);
  }

  getTrackByName(name) {
    return this.getTrackBy(a => a.name == name, name);
  }


  getPlaylistByName(name) {
    return this.playlists.find(playlist => playlist.name === name);
  }


  putRandomTracksInPlaylist(aPlaylist) {

    const tracksWithTheSpecifiedGenres = this.getTracksMatchingGenres(aPlaylist.genres);


    tracksWithTheSpecifiedGenres.forEach((actualTrack) => {
      if ((aPlaylist.duration() + actualTrack.duration) <= aPlaylist.maxDuration) {

        aPlaylist.addTrack(actualTrack);
      }
    });


    return aPlaylist;
  }

  existArtist(artistName) {
    try {
      this.getArtistByName(artistName);

    } catch (ArtistNotFoundException) {
      return false;
    }
    return true;

  }

  findAlbumWithTrackName(name) {
    const albums = this.allAlbums();
    return albums.find(album => album.hasThisTrack(name));
  }

  allTracks() {
    return aplanar(this.allAlbums().map(a => a.tracks));
  }

  allAlbums() {
    return aplanar(this.artists.map(a => a.albums));
  }

  //Persistence
  save(filename = 'estado.json') {
    new picklejs.FileSerializer().serialize(filename, this);

  }

  static load(filename = 'estado.json') {
    const fs = new picklejs.FileSerializer();
    const classes = [NotificadorUnqfy, MusixMatch, UNQfy, Album, Artist, Playlist, Track, TrackList];
    fs.registerClasses(...classes);
    return fs.load(filename);
  }

  idForAlbum() {
    const id = this.idAlbum;
    this.idAlbum++;
    return id;
  }

  idForArtist() {
    const id = this.idArtist;
    this.idArtist++;
    return id;
  }

}

module.exports = {
  UNQfy,
};