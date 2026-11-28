//! Points and lines on a flat map, in km.
//!
//! The map is always centred on a reference point, but what its axes point
//! to depends on the caller, such as east and north, or along a zone's axis.

use std::ops::{Add, Sub};

/// A point on a flat map, in km from its centre.
#[derive(Debug, Clone, Copy)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

impl Point {
    pub const ORIGIN: Self = Self::new(0., 0.);

    pub const fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    pub fn dot(self, other: Self) -> f64 {
        self.x * other.x + self.y * other.y
    }

    /// The z part of the 3D cross product, which is positive when `other`
    /// lies anticlockwise of `self`.
    pub fn cross(self, other: Self) -> f64 {
        self.x * other.y - self.y * other.x
    }

    pub fn scale(self, factor: f64) -> Self {
        Self::new(self.x * factor, self.y * factor)
    }

    /// The distance from the centre.
    pub fn length(self) -> f64 {
        self.x.hypot(self.y)
    }

    pub fn distance(self, other: Self) -> f64 {
        (self - other).length()
    }
}

impl Add for Point {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        Self::new(self.x + other.x, self.y + other.y)
    }
}

impl Sub for Point {
    type Output = Self;

    fn sub(self, other: Self) -> Self {
        Self::new(self.x - other.x, self.y - other.y)
    }
}

/// The straight line between two points. Places along it are given as a
/// fraction `t` of the way from `from` (0) to `to` (1).
#[derive(Debug, Clone, Copy)]
pub struct Segment {
    pub from: Point,
    pub to: Point,
}

impl Segment {
    pub const fn new(from: Point, to: Point) -> Self {
        Self { from, to }
    }

    /// The point a fraction `t` of the way along.
    pub fn point_at(self, t: f64) -> Point {
        self.from + (self.to - self.from).scale(t)
    }

    /// The fraction of the way along of the point closest to `point`.
    pub fn closest_fraction(self, point: Point) -> f64 {
        let direction = self.to - self.from;
        let length_squared = direction.dot(direction);
        if length_squared == 0. {
            return 0.;
        }
        let t = (point - self.from).dot(direction) / length_squared;
        t.clamp(0., 1.)
    }

    pub fn distance_to_point(self, point: Point) -> f64 {
        point.distance(self.point_at(self.closest_fraction(point)))
    }

    /// The distance to another segment, which is zero when they cross.
    pub fn distance_to_segment(self, other: Self) -> f64 {
        let side =
            |segment: Self, point: Point| (segment.to - segment.from).cross(point - segment.from);
        let crosses_other = side(other, self.from) * side(other, self.to) < 0.;
        let crossed_by_other = side(self, other.from) * side(self, other.to) < 0.;
        if crosses_other && crossed_by_other {
            return 0.;
        }
        let distances = [
            other.distance_to_point(self.from),
            other.distance_to_point(self.to),
            self.distance_to_point(other.from),
            self.distance_to_point(other.to),
        ];
        distances.into_iter().fold(f64::INFINITY, f64::min)
    }

    /// The fractions where the infinite line through the segment crosses the
    /// circle of the given radius around the centre, which can lie outside
    /// [0, 1]. `None` when the line misses the circle.
    pub fn circle_crossings(self, radius: f64) -> Option<[f64; 2]> {
        let direction = self.to - self.from;
        let a = direction.dot(direction);
        let b = 2. * self.from.dot(direction);
        let c = self.from.dot(self.from) - radius * radius;
        let discriminant = b * b - 4. * a * c;
        if a == 0. || discriminant < 0. {
            return None;
        }
        let root = discriminant.sqrt();
        Some([(-b - root) / (2. * a), (-b + root) / (2. * a)])
    }

    /// The fraction where the infinite line through the segment crosses the
    /// infinite line through the centre in `direction`, which can lie
    /// outside [0, 1]. `None` when the lines are parallel.
    pub fn line_through_centre_crossing(self, direction: Point) -> Option<f64> {
        let denominator = direction.cross(self.to - self.from);
        (denominator != 0.).then(|| -direction.cross(self.from) / denominator)
    }
}
