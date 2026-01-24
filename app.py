from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import os
from dotenv import load_dotenv
from collections import defaultdict
import time

load_dotenv()

app = Flask(__name__)
CORS(app)

# Genius API Configuration
GENIUS_ACCESS_TOKEN = os.getenv('GENIUS_ACCESS_TOKEN')
GENIUS_ACCESS_BASE = 'https://api.genius.com'

headers = {
    'Authorization': f'Bearer {GENIUS_ACCESS_TOKEN}'
}


def find_original_song_with_credits(song_title, artist_name):
    """
    Find the original version of a song that contains producer credits.
    Filters out translations and versions without credits.
    """
    try:
        search_url = f'{GENIUS_ACCESS_BASE}/search'
        params = {'q': f'{song_title} {artist_name}'}
        response = requests.get(search_url, headers=headers, params=params)
        response.raise_for_status()
        
        data = response.json()
        hits = data['response']['hits']
        
        if not hits:
            print(f"No results found for: {song_title} by {artist_name}")
            return None
        
        # Try to find the best match with credits
        for hit in hits[:10]:  # Check top 10 results
            song = hit['result']
            song_id = song['id']
            song_title_result = song['title']
            artist_result = song['primary_artist']['name']
            
            # Skip translations and romanized versions
            title_lower = song_title_result.lower()
            if any(keyword in title_lower for keyword in ['translation', 'romanized', 'english ver', 'japanese ver']):
                continue
            
            # Get full song details to check for credits
            song_details = get_song_details(song_id)
            
            if song_details and has_producer_credits(song_details):
                print(f"✓ Found original with credits: {song_title_result} by {artist_result}")
                return {
                    'song_id': song_id,
                    'song_name': song_title_result,
                    'artist': artist_result,
                    'song_details': song_details
                }
            
            # Small delay to avoid rate limiting
            time.sleep(0.3)
        
        # If no song with credits found, return the first result
        print(f"⚠ No version with credits found for: {song_title} by {artist_name}")
        first_song = hits[0]['result']
        song_details = get_song_details(first_song['id'])
        
        return {
            'song_id': first_song['id'],
            'song_name': first_song['title'],
            'artist': first_song['primary_artist']['name'],
            'song_details': song_details
        }
        
    except Exception as e:
        print(f"Error searching for '{song_title}' by '{artist_name}': {str(e)}")
        return None


def get_song_details(song_id):
    """Get complete song details from Genius API"""
    try:
        song_url = f'{GENIUS_ACCESS_BASE}/songs/{song_id}'
        response = requests.get(song_url, headers=headers)
        response.raise_for_status()
        
        data = response.json()
        return data['response']['song']
    except Exception as e:
        print(f"Error getting details for song ID {song_id}: {str(e)}")
        return None


def has_producer_credits(song_details):
    """Check if song details contain producer credits"""
    if not song_details:
        return False
    
    # Check custom_performances
    if 'custom_performances' in song_details and song_details['custom_performances']:
        for performance in song_details['custom_performances']:
            if 'producer' in performance['label'].lower():
                return True
    
    # Check producer_artists
    if 'producer_artists' in song_details and song_details['producer_artists']:
        return True
    
    return False


def extract_producers(song_details):
    """Extract producer information from song details"""
    producers = []
    seen_ids = set()
    
    if not song_details:
        return producers
    
    # Extract from custom_performances
    if 'custom_performances' in song_details:
        for performance in song_details['custom_performances']:
            label = performance['label'].lower()
            if 'producer' in label or 'produced' in label:
                for artist in performance['artists']:
                    producer_id = str(artist['id'])
                    if producer_id not in seen_ids:
                        producers.append({
                            'id': producer_id,
                            'name': artist['name'],
                            'url': artist.get('url', '')
                        })
                        seen_ids.add(producer_id)
    
    # Extract from producer_artists
    if 'producer_artists' in song_details:
        for producer in song_details['producer_artists']:
            producer_id = str(producer['id'])
            if producer_id not in seen_ids:
                producers.append({
                    'id': producer_id,
                    'name': producer['name'],
                    'url': producer.get('url', '')
                })
                seen_ids.add(producer_id)
    
    return producers


def process_songs(songs_list):
    """
    Process a list of songs and extract producer information
    Input: [{"title": "Song Name", "artist": "Artist Name"}, ...]
    Output: List of song data with producers
    """
    songs_data = []
    
    for idx, song in enumerate(songs_list, 1):
        print(f"\n[{idx}/{len(songs_list)}] Processing: {song['title']} by {song['artist']}")
        
        # Find original song with credits
        song_info = find_original_song_with_credits(song['title'], song['artist'])
        
        if song_info:
            # Extract producers
            producers = extract_producers(song_info['song_details'])
            
            song_data = {
                'song_id': song_info['song_id'],
                'song_name': song_info['song_name'],
                'artist': song_info['artist'],
                'producers': producers,
                'producer_count': len(producers)
            }
            
            songs_data.append(song_data)
            print(f"  Found {len(producers)} producer(s): {', '.join([p['name'] for p in producers])}")
        else:
            print(f"  ✗ Could not find song")
        
        # Rate limiting
        time.sleep(0.5)
    
    return songs_data


def build_producer_network(songs_data):
    """
    Build the producer network structure from songs data
    Output: {producer_id: {id, name, edges: [{song_name, collaborators}]}}
    """
    producer_network = defaultdict(lambda: {
        'id': None,
        'name': None,
        'url': None,
        'edges': [],
        'total_collaborations': 0,
        'unique_collaborators': set()
    })
    
    for song in songs_data:
        song_id = song['song_id']
        song_name = song['song_name']
        producers = song['producers']
        
        # Skip songs with no producers or only one producer (no collaboration)
        if len(producers) < 2:
            continue
        
        producer_ids = [p['id'] for p in producers]
        
        # Add edges for each producer
        for producer in producers:
            p_id = producer['id']
            p_name = producer['name']
            p_url = producer.get('url', '')
            
            # Initialize producer info if not set
            if producer_network[p_id]['id'] is None:
                producer_network[p_id]['id'] = p_id
                producer_network[p_id]['name'] = p_name
                producer_network[p_id]['url'] = p_url
            
            # Get collaborators (all other producers on this song)
            collaborators = [pid for pid in producer_ids if pid != p_id]
            
            # Add edge
            producer_network[p_id]['edges'].append({
                'song_id': song_id,
                'song_name': song_name,
                'collaborators': collaborators
            })
            
            # Update collaboration stats
            producer_network[p_id]['total_collaborations'] += len(collaborators)
            producer_network[p_id]['unique_collaborators'].update(collaborators)
    
    # Convert sets to lists and calculate final stats
    network_output = {}
    for p_id, p_data in producer_network.items():
        network_output[p_id] = {
            'id': p_data['id'],
            'name': p_data['name'],
            'url': p_data['url'],
            'edges': p_data['edges'],
            'total_songs': len(p_data['edges']),
            'total_collaborations': p_data['total_collaborations'],
            'unique_collaborators_count': len(p_data['unique_collaborators'])
        }
    
    return network_output


@app.route('/api/process-songs', methods=['POST'])
def api_process_songs():
    """
    Process a list of songs and extract producer information
    Expected input: {"songs": [{"title": "Song Name", "artist": "Artist Name"}, ...]}
    """
    try:
        data = request.get_json()
        songs_list = data.get('songs', [])
        
        if not songs_list:
            return jsonify({'error': 'No songs provided'}), 400
        
        # Validate input format
        for song in songs_list:
            if 'title' not in song or 'artist' not in song:
                return jsonify({'error': 'Each song must have "title" and "artist" fields'}), 400
        
        songs_data = process_songs(songs_list)
        
        return jsonify({
            'success': True,
            'songs': songs_data,
            'total_songs': len(songs_data),
            'total_producers_found': sum(len(s['producers']) for s in songs_data)
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/build-network', methods=['POST'])
def api_build_network():
    """
    Build producer network from processed songs data
    Expected input: {"songs": [{"song_id": ..., "song_name": ..., "producers": [...]}, ...]}
    """
    try:
        data = request.get_json()
        songs_data = data.get('songs', [])
        
        if not songs_data:
            return jsonify({'error': 'No songs data provided'}), 400
        
        network = build_producer_network(songs_data)
        
        # Calculate network statistics
        total_producers = len(network)
        total_songs_with_collabs = sum(
            1 for song in songs_data if len(song.get('producers', [])) >= 2
        )
        
        return jsonify({
            'success': True,
            'network': network,
            'stats': {
                'total_producers': total_producers,
                'total_songs_with_collaborations': total_songs_with_collabs,
                'most_collaborative_producer': max(
                    network.items(),
                    key=lambda x: x[1]['unique_collaborators_count']
                )[1]['name'] if network else None
            }
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/process-and-build', methods=['POST'])
def api_process_and_build():
    """
    Combined endpoint: process songs and build network in one call
    Expected input: {"songs": [{"title": "Song Name", "artist": "Artist Name"}, ...]}
    """
    try:
        data = request.get_json()
        songs_list = data.get('songs', [])
        
        if not songs_list:
            return jsonify({'error': 'No songs provided'}), 400
        
        # Validate input
        for song in songs_list:
            if 'title' not in song or 'artist' not in song:
                return jsonify({'error': 'Each song must have "title" and "artist" fields'}), 400
        
        # Step 1: Process songs
        print("\n" + "="*50)
        print("PROCESSING SONGS")
        print("="*50)
        songs_data = process_songs(songs_list)
        
        # Step 2: Build network
        print("\n" + "="*50)
        print("BUILDING NETWORK")
        print("="*50)
        network = build_producer_network(songs_data)
        
        # Calculate statistics
        total_producers = len(network)
        total_songs_with_collabs = sum(
            1 for song in songs_data if len(song.get('producers', [])) >= 2
        )
        
        most_collaborative = None
        if network:
            most_collab_producer = max(
                network.items(),
                key=lambda x: x[1]['unique_collaborators_count']
            )
            most_collaborative = {
                'name': most_collab_producer[1]['name'],
                'collaborators_count': most_collab_producer[1]['unique_collaborators_count'],
                'total_songs': most_collab_producer[1]['total_songs']
            }
        
        return jsonify({
            'success': True,
            'songs': songs_data,
            'network': network,
            'stats': {
                'total_songs_processed': len(songs_data),
                'total_producers': total_producers,
                'total_songs_with_collaborations': total_songs_with_collabs,
                'most_collaborative_producer': most_collaborative
            }
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'api_configured': bool(GENIUS_ACCESS_TOKEN)
    })


# Example usage route for testing
@app.route('/api/test-kpop', methods=['GET'])
def test_kpop():
    """Test endpoint with predefined K-pop songs"""
    songs = [
        {"title": "Alcohol-Free", "artist": "TWICE"},
        {"title": "Antifragile", "artist": "LE SSERAFIM"},
        {"title": "Always", "artist": "ZEROBASEONE"},
        {"title": "Appetizer", "artist": "Jay Park"},
        {"title": "Bang Bang Bang", "artist": "BIGBANG"},
        {"title": "Bad Boy", "artist": "Red Velvet"},
        {"title": "FANCY", "artist": "TWICE"},
        {"title": "DALLA DALLA", "artist": "ITZY"}
    ]
    
    try:
        songs_data = process_songs(songs)
        network = build_producer_network(songs_data)
        
        return jsonify({
            'success': True,
            'songs': songs_data,
            'network': network,
            'stats': {
                'total_songs_processed': len(songs_data),
                'total_producers': len(network)
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    if not GENIUS_ACCESS_TOKEN:
        print("="*50)
        print("WARNING: GENIUS_ACCESS_TOKEN not found!")
        print("="*50)
        print("Please create a .env file with:")
        print("GENIUS_ACCESS_TOKEN=your_token_here")
        print("="*50)
    else:
        print("✓ Genius API Token configured")
    
    app.run(debug=True, port=5000)