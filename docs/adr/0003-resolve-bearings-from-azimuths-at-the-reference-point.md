# Resolve bearings from azimuths at the reference point

Resolving a task replaces every orientation with a fixed bearing at the task point's reference point, so the line and zone geometry never needs the neighbouring task points. A start points toward the next point, a finish toward the previous point and a symmetric turnpoint along the inner bisector of its courses to the previous and next point. Keyhole measures each of these courses as the geodesic azimuth at the reference point itself, following Annex A §1 f):

> All bearings, courses, tracks and headings shall be referenced to True North and shall be specified at the point of origin.

The course from a turnpoint to its previous point therefore starts at the turnpoint, and its azimuth is taken there. Measured this way, "symmetric" means symmetric where the zone actually is.

SeeYou measures each course where its leg begins instead. Its `oz_angle12` takes the incoming course at the previous point and reverses it, and this convention reproduces every `oz_angle12` of the committed fixtures within 0.0001°. A start bearing is the same under both conventions, since its only course already begins at the start. On a geodesic the azimuth changes along the way, though, so symmetric and finish bearings differ. On the committed fixtures the difference reaches 1.01° at the finish of `dm-zwickau-2024/15-meter/2024-06-16` and 0.90° at one of its turnpoints. It grows with leg length and latitude. Keyhole accepts this divergence as the more faithful reading of the rule, and the oracle compares turnpoint and finish bearings with a tolerance measured on the full-data suite.

When the courses to the previous and next point are exactly opposite, so that the task runs straight through a turnpoint, both sides have an equal claim to being inside. The bisector is then the incoming course plus 90°, which points to the right of the task.

Only the resolution step depends on this convention. Should a competition ever need SeeYou's bearings exactly, an option on resolution could switch the course measurement without touching the zone geometry.
