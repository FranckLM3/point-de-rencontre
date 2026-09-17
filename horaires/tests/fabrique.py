"""Petit GTFS synthétique, écrit dans une archive zip en mémoire."""
import io
import zipfile

# Trois gares alignées (A, B, C) et une gare D à 300 m de C.
STOPS = """stop_id,stop_name,stop_desc,stop_lat,stop_lon,zone_id,stop_url,location_type,parent_station
StopArea:OCE1,Alpha,,45.0000,4.0000,,,1,
StopArea:OCE2,Beta,,45.0000,5.0000,,,1,
StopArea:OCE3,Gamma,,45.0000,6.0000,,,1,
StopArea:OCE4,Delta,,45.0027,6.0000,,,1,
StopPoint:OCETGV INOUI-1,Alpha,,45.0000,4.0000,,,0,StopArea:OCE1
StopPoint:OCETGV INOUI-2,Beta,,45.0000,5.0000,,,0,StopArea:OCE2
StopPoint:OCETrain TER-2,Beta,,45.0000,5.0000,,,0,StopArea:OCE2
StopPoint:OCETrain TER-3,Gamma,,45.0000,6.0000,,,0,StopArea:OCE3
StopPoint:OCETrain TER-4,Delta,,45.0027,6.0000,,,0,StopArea:OCE4
"""

ROUTES = """route_id,agency_id,route_short_name,route_long_name,route_desc,route_type,route_url,route_color,route_text_color
R1,1,,Alpha - Beta,,2,,,
R2,1,,Beta - Gamma,,2,,,
"""

# T1 : A 08:00 -> B 09:00 (grande ligne). T2 : B 09:10 -> C 09:40 (TER).
# T3 : B 08:50 -> C 09:20, parti avant l'arrivée de T1 : correspondance manquée.
# T4 : circule un autre jour.
TRIPS = """route_id,service_id,trip_id,trip_headsign,direction_id,block_id,shape_id
R1,S1,T1,,0,,
R2,S1,T2,,0,,
R2,S1,T3,,0,,
R2,S2,T4,,0,,
"""

STOP_TIMES = """trip_id,arrival_time,departure_time,stop_id,stop_sequence,stop_headsign,pickup_type,drop_off_type,shape_dist_traveled
T1,08:00:00,08:00:00,StopPoint:OCETGV INOUI-1,0,,0,1,
T1,09:00:00,09:00:00,StopPoint:OCETGV INOUI-2,1,,1,0,
T2,09:10:00,09:10:00,StopPoint:OCETrain TER-2,0,,0,1,
T2,09:40:00,09:40:00,StopPoint:OCETrain TER-3,1,,1,0,
T3,08:50:00,08:50:00,StopPoint:OCETrain TER-2,0,,0,1,
T3,09:20:00,09:20:00,StopPoint:OCETrain TER-3,1,,1,0,
T4,10:00:00,10:00:00,StopPoint:OCETrain TER-2,0,,0,1,
T4,10:05:00,10:05:00,StopPoint:OCETrain TER-3,1,,1,0,
"""

# 2026-10-06 et 2026-10-13 sont des mardis ; S2 ne circule que le 2026-10-07.
CALENDAR_DATES = """service_id,date,exception_type
S1,20261006,1
S1,20261013,1
S2,20261007,1
"""

FEED_INFO = """feed_id,feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date,feed_version,conv_rev,plan_rev
0,SNCF,http://www.sncf.com,fr,20260928,20261031,2026-09-28,1,1
"""


def archive() -> bytes:
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w") as z:
        for nom, contenu in {
            "stops.txt": STOPS,
            "routes.txt": ROUTES,
            "trips.txt": TRIPS,
            "stop_times.txt": STOP_TIMES,
            "calendar_dates.txt": CALENDAR_DATES,
            "feed_info.txt": FEED_INFO,
        }.items():
            z.writestr(nom, contenu)
    return tampon.getvalue()


def heure(h: int, m: int = 0) -> int:
    return h * 3600 + m * 60


def reseau_synthetique(n: int, trains: list[tuple], a_pied=None):
    """n gares espacées d'un degré ; trains = (départ, arrivée, de, vers, trajet[, montée, descente])."""
    from horaires.gtfs import Connexion, Gare, Reseau

    gares = [Gare(str(i), str(i), 45.0, 4.0 + i) for i in range(n)]
    connexions = sorted(
        (Connexion(t[0], t[1], t[2], t[3], t[4], 10.0, False, *t[5:]) for t in trains),
        key=lambda c: (c.depart, c.arrivee),
    )
    return Reseau("v", "j", gares, connexions, a_pied or [[] for _ in gares])
