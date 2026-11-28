mod support;

use approx::assert_abs_diff_eq;
use insta::assert_snapshot;
use jiff::{RoundMode, Timestamp, TimestampRound, Unit};
use keyhole_engine::flight_analysis::{
    IgcFile, NearMiss, PlacedZone, Record, ZoneCrossing, ZoneEvent, ZoneVisit, zone_visits,
};
use keyhole_engine::geodesy::{EarthModel, LngLat};
use keyhole_engine::task::{ObservationZone, Task, TaskKind, TaskPoint, TwoArcZone};
use support::{cylinder, edpa_task, line, parse, reducing_cylinder, seeyou_task, tocumwal_task};

/// A zone shape with the resolved bearing and the reference point it is
/// placed at.
#[derive(Clone, Copy)]
struct Placement {
    shape: TwoArcZone,
    bearing: f64,
    reference_point: LngLat,
}

impl Placement {
    fn place(self, earth_model: EarthModel) -> PlacedZone {
        PlacedZone::new(earth_model, self.reference_point, self.bearing, self.shape)
    }
}

/// A placement from a shape as (R1, A1, R2, A2) and a reference point as
/// (latitude, longitude).
const fn placement(
    (r1, a1, r2, a2): (f64, f64, f64, f64),
    bearing: f64,
    (latitude, longitude): (f64, f64),
) -> Placement {
    Placement {
        shape: TwoArcZone { r1, a1, r2, a2 },
        bearing,
        reference_point: LngLat {
            longitude,
            latitude,
        },
    }
}

const CYLINDER: Placement = placement((0.5, 180., 0., 0.), 0., (51., 7.));
const KEYHOLE: Placement = placement((10., 45., 0.5, 180.), 20., (51., 7.));
/// A sector whose axis points north, so it reaches from 315° to 45°.
const SECTOR: Placement = placement((10., 45., 0., 0.), 180., (-33., 149.));
const ANNULAR_SECTOR: Placement = placement((10., 30., 5., 0.), 300., (-33., 149.));
const HALF_DISC_AND_CYLINDER: Placement = placement((5., 90., 0.5, 180.), 90., (64., -20.));
/// A 3 km cylinder with a 1 km disc cut out of its middle.
const CUTOUT: Placement = placement((3., 180., 1., 0.), 45., (64., -20.));
/// A half disc of 10 km with the R2 disc of 2 km cut out, except for a
/// 30° sector either side of the axis.
const PARTIAL_CUTOUT: Placement = placement((10., 90., 2., 30.), 135., (51., 7.));

/// The distance from a position to a zone, as Karney's geographiclib and a
/// brute-force search measure it.
struct ReferencePointDistance {
    earth_model: EarthModel,
    placement: Placement,
    position: LngLat,
    distance: f64,
}

const fn point(
    earth_model: EarthModel,
    placement: Placement,
    (latitude, longitude): (f64, f64),
    distance: f64,
) -> ReferencePointDistance {
    ReferencePointDistance {
        earth_model,
        placement,
        position: LngLat {
            longitude,
            latitude,
        },
        distance,
    }
}

/// The distance from the straight line between two positions to a zone, as
/// Karney's geographiclib and a brute-force search measure it.
struct ReferenceSegmentDistance {
    earth_model: EarthModel,
    placement: Placement,
    from: LngLat,
    to: LngLat,
    distance: f64,
}

const fn segment(
    earth_model: EarthModel,
    placement: Placement,
    (from_latitude, from_longitude): (f64, f64),
    (to_latitude, to_longitude): (f64, f64),
    distance: f64,
) -> ReferenceSegmentDistance {
    ReferenceSegmentDistance {
        earth_model,
        placement,
        from: LngLat {
            longitude: from_longitude,
            latitude: from_latitude,
        },
        to: LngLat {
            longitude: to_longitude,
            latitude: to_latitude,
        },
        distance,
    }
}

#[rustfmt::skip]
const REFERENCE_POINT_DISTANCES: [ReferencePointDistance; 112] = [
    point(EarthModel::Wgs84, CYLINDER, (50.99734429454763, 6.999257931581664), 0.0),
    point(EarthModel::Wgs84, CYLINDER, (51.00619662300253, 6.998268177494489), 0.20000000000098128),
    point(EarthModel::Wgs84, CYLINDER, (50.98732954858402, 6.99269362533473), 1.0000000000008809),
    point(EarthModel::Wgs84, CYLINDER, (51.002339464375986, 6.978955344540606), 0.9999999999998243),
    point(EarthModel::Wgs84, CYLINDER, (50.976879982516195, 6.956370977733256), 3.499999999999308),
    point(EarthModel::Wgs84, CYLINDER, (50.93707733633106, 7.0), 6.500000000000488),
    point(EarthModel::Wgs84, CYLINDER, (50.90655263826953, 7.085301662483492), 11.499999999999742),
    point(EarthModel::Wgs84, CYLINDER, (51.08515830350529, 6.765167464439805), 18.500000000000796),
    point(EarthModel::FaiSphere, CYLINDER, (50.997343020964955, 6.999255594044528), 0.0),
    point(EarthModel::FaiSphere, CYLINDER, (51.00619959934974, 6.99826272116164), 0.20000000000050416),
    point(EarthModel::FaiSphere, CYLINDER, (50.98732348252407, 6.992670615010126), 0.99999999999984),
    point(EarthModel::FaiSphere, CYLINDER, (51.002340581326926, 6.978889046122942), 0.9999999999996636),
    point(EarthModel::FaiSphere, CYLINDER, (50.976868910107136, 6.956233605657481), 3.5000000000005658),
    point(EarthModel::FaiSphere, CYLINDER, (50.93704748758569, 7.0), 6.500000000000029),
    point(EarthModel::FaiSphere, CYLINDER, (50.90650845707268, 7.0855698404215275), 11.500000000000295),
    point(EarthModel::FaiSphere, CYLINDER, (51.08519904182306, 6.764426332434432), 18.500000000000288),
    point(EarthModel::Wgs84, KEYHOLE, (50.99766459441753, 6.997863284437544), 0.0),
    point(EarthModel::Wgs84, KEYHOLE, (51.00619662300253, 7.001731822505511), 0.20000000000098123),
    point(EarthModel::Wgs84, KEYHOLE, (50.989670334607474, 6.986267816533849), 0.0),
    point(EarthModel::Wgs84, KEYHOLE, (51.006740207809564, 6.981491889659168), 1.0000000000005556),
    point(EarthModel::Wgs84, KEYHOLE, (50.987690177514644, 6.946468648812676), 0.3486229709904743),
    point(EarthModel::Wgs84, KEYHOLE, (50.94086708648396, 6.96593758228332), 0.0),
    point(EarthModel::Wgs84, KEYHOLE, (50.89376716859634, 7.029616835118377), 1.9999999999999463),
    point(EarthModel::Wgs84, KEYHOLE, (51.13070064175332, 6.825529746704298), 18.35259069949048),
    point(EarthModel::FaiSphere, KEYHOLE, (50.99766347431992, 6.997856553674791), 0.0),
    point(EarthModel::FaiSphere, KEYHOLE, (51.00619959934974, 7.00173727883836), 0.20000000000050422),
    point(EarthModel::FaiSphere, KEYHOLE, (50.98966538517552, 6.986224566911979), 0.0),
    point(EarthModel::FaiSphere, KEYHOLE, (51.00674344098932, 6.9814335767587865), 0.9999999999994872),
    point(EarthModel::FaiSphere, KEYHOLE, (50.98768424577843, 6.946300058603194), 0.3486229709906178),
    point(EarthModel::FaiSphere, KEYHOLE, (50.94083900054478, 6.9658304151393295), 0.0),
    point(EarthModel::FaiSphere, KEYHOLE, (50.89371715921719, 7.029709921240792), 2.0000000000002944),
    point(EarthModel::FaiSphere, KEYHOLE, (51.13076441026217, 6.824978574855497), 18.352590699492055),
    point(EarthModel::Wgs84, SECTOR, (-32.99733606263609, 149.00055742210705), 0.0),
    point(EarthModel::Wgs84, SECTOR, (-33.00621583974153, 149.00130078188428), 0.7000000000006047),
    point(EarthModel::Wgs84, SECTOR, (-32.98729037779346, 149.00548891421107), 0.0),
    point(EarthModel::Wgs84, SECTOR, (-33.00234761738509, 149.01580738299955), 1.2287280664341855),
    point(EarthModel::Wgs84, SECTOR, (-32.97681218065538, 149.0327797891932), 0.3486229709910521),
    point(EarthModel::Wgs84, SECTOR, (-32.93688228938366, 149.0), 0.0),
    point(EarthModel::Wgs84, SECTOR, (-32.90627779394685, 148.9358644979132), 1.999999999999859),
    point(EarthModel::Wgs84, SECTOR, (-33.08553435417708, 149.17624214396116), 18.352590699492815),
    point(EarthModel::FaiSphere, SECTOR, (-32.99734302208632, 149.00055860141504), 0.0),
    point(EarthModel::FaiSphere, SECTOR, (-33.006199605456644, 149.00130353415489), 0.6999999999994432),
    point(EarthModel::FaiSphere, SECTOR, (-32.98732359124205, 149.00550052549332), 0.0),
    point(EarthModel::FaiSphere, SECTOR, (-33.00234148313779, 149.01584082772501), 1.2287280664333353),
    point(EarthModel::FaiSphere, SECTOR, (-32.976872787093555, 149.0328491235437), 0.3486229709905236),
    point(EarthModel::FaiSphere, SECTOR, (-32.93704748758569, 149.0), 0.0),
    point(EarthModel::FaiSphere, SECTOR, (-32.906523287914744, 148.9357289494413), 2.000000000001004),
    point(EarthModel::FaiSphere, SECTOR, (-33.0853112397031, 149.17661538188483), 18.352590699493106),
    point(EarthModel::Wgs84, ANNULAR_SECTOR, (-33.001738735980055, 149.00245917533587), 4.699999999998489),
    point(EarthModel::Wgs84, ANNULAR_SECTOR, (-32.99784105929965, 148.99296151750988), 5.554485673924792),
    point(EarthModel::Wgs84, ANNULAR_SECTOR, (-33.01036043500728, 149.0103184693048), 3.500000000000212),
    point(EarthModel::Wgs84, ANNULAR_SECTOR, (-33.01036043500728, 148.9896815306952), 4.7031582846108915),
    point(EarthModel::Wgs84, ANNULAR_SECTOR, (-33.03551881805187, 149.00743549833604), 1.8472398784577106),
    point(EarthModel::Wgs84, ANNULAR_SECTOR, (-33.03154175227298, 149.06489168550303), 0.0),
    point(EarthModel::Wgs84, ANNULAR_SECTOR, (-32.99993396486119, 149.12840643388407), 1.9999999999995377),
    point(EarthModel::Wgs84, ANNULAR_SECTOR, (-33.08553435417708, 148.82375785603884), 19.6468827043895),
    point(EarthModel::FaiSphere, ANNULAR_SECTOR, (-33.00173419414814, 149.00246437833994), 4.699999999999365),
    point(EarthModel::FaiSphere, ANNULAR_SECTOR, (-32.99784669895863, 148.99294662648566), 5.554485673925034),
    point(EarthModel::FaiSphere, ANNULAR_SECTOR, (-33.010333378591746, 149.0103403027504), 3.4999999999994515),
    point(EarthModel::FaiSphere, ANNULAR_SECTOR, (-33.010333378591746, 148.9896596972496), 4.703158284611352),
    point(EarthModel::FaiSphere, ANNULAR_SECTOR, (-33.035426134305496, 149.00745123601277), 1.8472398784565331),
    point(EarthModel::FaiSphere, ANNULAR_SECTOR, (-33.031459401177734, 149.06502902644954), 0.0),
    point(EarthModel::FaiSphere, ANNULAR_SECTOR, (-32.999933998016054, 149.12867810438735), 1.9999999999994775),
    point(EarthModel::FaiSphere, ANNULAR_SECTOR, (-33.0853112397031, 148.82338461811517), 19.646882704389604),
    point(EarthModel::Wgs84, HALF_DISC_AND_CYLINDER, (64.00046718425531, -20.00603794690814), 0.0),
    point(EarthModel::Wgs84, HALF_DISC_AND_CYLINDER, (64.001089706052, -19.98591114366729), 0.20000000000003562),
    point(EarthModel::Wgs84, HALF_DISC_AND_CYLINDER, (64.00459924415759, -20.028810965078968), 0.0),
    point(EarthModel::Wgs84, HALF_DISC_AND_CYLINDER, (64.0132511175577, -19.994674301942528), 0.2604722665005327),
    point(EarthModel::Wgs84, HALF_DISC_AND_CYLINDER, (64.0274774319519, -20.05259731572688), 0.0),
    point(EarthModel::Wgs84, HALF_DISC_AND_CYLINDER, (63.999929542737966, -20.143056183749), 2.0000000000000435),
    point(EarthModel::Wgs84, HALF_DISC_AND_CYLINDER, (63.94602223049682, -20.211975249472516), 6.999999999999904),
    point(EarthModel::Wgs84, HALF_DISC_AND_CYLINDER, (64.14747180607088, -19.80482259101881), 14.88137000685676),
    point(EarthModel::FaiSphere, HALF_DISC_AND_CYLINDER, (64.00046837036075, -20.00606112246713), 0.0),
    point(EarthModel::FaiSphere, HALF_DISC_AND_CYLINDER, (64.00109247118392, -19.985857064952068), 0.20000000000050433),
    point(EarthModel::FaiSphere, HALF_DISC_AND_CYLINDER, (64.00461091597688, -20.028921567111183), 0.0),
    point(EarthModel::FaiSphere, HALF_DISC_AND_CYLINDER, (64.01328478511999, -19.994653850840717), 0.2604722665004217),
    point(EarthModel::FaiSphere, HALF_DISC_AND_CYLINDER, (64.02754723611496, -20.052799396763227), 0.0),
    point(EarthModel::FaiSphere, HALF_DISC_AND_CYLINDER, (63.99992909266919, -20.14360526778665), 2.0000000000000666),
    point(EarthModel::FaiSphere, HALF_DISC_AND_CYLINDER, (63.94588474338303, -20.212787290599092), 7.00000000000047),
    point(EarthModel::FaiSphere, HALF_DISC_AND_CYLINDER, (64.1478473675627, -19.804069464523895), 14.881370006856026),
    point(EarthModel::Wgs84, CUTOUT, (63.99845634437499, -20.005021935619073), 0.700000000000214),
    point(EarthModel::Wgs84, CUTOUT, (64.00514347005931, -19.99179311199378), 0.3000000000003005),
    point(EarthModel::Wgs84, CUTOUT, (63.9943107379447, -20.02777717125988), 0.0),
    point(EarthModel::Wgs84, CUTOUT, (64.01102114903728, -20.0175898845094), 0.0),
    point(EarthModel::Wgs84, CUTOUT, (64.00310446372507, -20.081444516076296), 1.0000000000001803),
    point(EarthModel::Wgs84, CUTOUT, (63.955563318400564, -20.100995839964902), 4.00000000000109),
    point(EarthModel::Wgs84, CUTOUT, (63.89600816340287, -20.063237734071656), 9.0000000000003),
    point(EarthModel::Wgs84, CUTOUT, (64.16459380551431, -20.101093390020758), 16.000000000000316),
    point(EarthModel::FaiSphere, CUTOUT, (63.99845242356855, -20.005041210013392), 0.7000000000004258),
    point(EarthModel::FaiSphere, CUTOUT, (64.00515653459897, -19.991761606063857), 0.299999999999496),
    point(EarthModel::FaiSphere, CUTOUT, (63.99429628016141, -20.027883765324304), 0.0),
    point(EarthModel::FaiSphere, CUTOUT, (64.01104914534623, -20.017657425649954), 0.0),
    point(EarthModel::FaiSphere, CUTOUT, (64.00311226135943, -20.081757155506033), 1.0000000000001683),
    point(EarthModel::FaiSphere, CUTOUT, (63.9554504587383, -20.101382870565605), 3.9999999999993223),
    point(EarthModel::FaiSphere, CUTOUT, (63.89574474126165, -20.063479554759464), 9.000000000000648),
    point(EarthModel::FaiSphere, CUTOUT, (64.16501359479687, -20.101483718566747), 15.999999999999233),
    point(EarthModel::Wgs84, PARTIAL_CUTOUT, (51.00220895741154, 6.997548621155886), 0.0),
    point(EarthModel::Wgs84, PARTIAL_CUTOUT, (50.99639063719886, 7.008167819326161), 0.7000000000012868),
    point(EarthModel::Wgs84, PARTIAL_CUTOUT, (51.012219707590546, 6.990967023656666), 0.0),
    point(EarthModel::Wgs84, PARTIAL_CUTOUT, (51.007732418114074, 7.017506737990298), 0.5840834545921765),
    point(EarthModel::Wgs84, PARTIAL_CUTOUT, (51.0358185750563, 7.00497013086219), 0.0),
    point(EarthModel::Wgs84, PARTIAL_CUTOUT, (51.04447132968351, 6.92942094966109), 0.0),
    point(EarthModel::Wgs84, PARTIAL_CUTOUT, (51.027801163906176, 6.834780124179159), 1.9999999999996458),
    point(EarthModel::Wgs84, PARTIAL_CUTOUT, (51.043910481928606, 7.261689170482578), 11.4852229652674),
    point(EarthModel::FaiSphere, PARTIAL_CUTOUT, (51.002210017587636, 6.997540898431067), 0.0),
    point(EarthModel::FaiSphere, PARTIAL_CUTOUT, (50.996388905682466, 7.008193547665912), 0.6999999999997966),
    point(EarthModel::FaiSphere, PARTIAL_CUTOUT, (51.012225582247574, 6.990938560388138), 0.0),
    point(EarthModel::FaiSphere, PARTIAL_CUTOUT, (51.00773612906984, 7.017561897079924), 0.5840834545904612),
    point(EarthModel::FaiSphere, PARTIAL_CUTOUT, (51.03583587059773, 7.004985799920426), 0.0),
    point(EarthModel::FaiSphere, PARTIAL_CUTOUT, (51.04449276967612, 6.929198397429875), 0.0),
    point(EarthModel::FaiSphere, PARTIAL_CUTOUT, (51.027814200959824, 6.834259335139305), 1.999999999999941),
    point(EarthModel::FaiSphere, PARTIAL_CUTOUT, (51.04393079191312, 7.262514325944569), 11.485222965267816),
];

#[rustfmt::skip]
const REFERENCE_SEGMENT_DISTANCES: [ReferenceSegmentDistance; 84] = [
    segment(EarthModel::Wgs84, CYLINDER, (50.99875073551116, 6.988777049673493), (50.99875073551116, 7.011222950326507), 0.0),
    segment(EarthModel::Wgs84, CYLINDER, (50.98875979048285, 7.0308349319508805), (50.98875979048285, 6.9691650680491195), 0.7499999999997196),
    segment(EarthModel::Wgs84, CYLINDER, (50.936380578745165, 7.1198755932871), (50.936380578745165, 6.8801244067129), 6.570663706551036),
    segment(EarthModel::Wgs84, CYLINDER, (50.95867155328252, 6.945107820990509), (50.9763969642271, 6.789670447274395), 5.499999999999508),
    segment(EarthModel::Wgs84, CYLINDER, (51.00934122207835, 6.991450991995355), (51.00934122207835, 7.008549008004645), 0.5392304845411614),
    segment(EarthModel::Wgs84, CYLINDER, (51.15933144540103, 6.955320208261149), (51.011232046271495, 7.030849830537325), 1.999999999999585),
    segment(EarthModel::FaiSphere, CYLINDER, (50.99875013456139, 6.988741695981019), (50.99875013456139, 7.011258304018981), 0.0),
    segment(EarthModel::FaiSphere, CYLINDER, (50.98875439559185, 7.030932044907776), (50.98875439559185, 6.969067955092224), 0.7500000000007786),
    segment(EarthModel::FaiSphere, CYLINDER, (50.93635020954762, 7.120252709190082), (50.93635020954762, 6.879747290809918), 6.57066370655199),
    segment(EarthModel::FaiSphere, CYLINDER, (50.95865183073469, 6.944935053073958), (50.976385091100184, 6.789008203034322), 5.499999999999667),
    segment(EarthModel::FaiSphere, CYLINDER, (51.00934571043625, 6.9914240554029305), (51.00934571043625, 7.0085759445970695), 0.5392304845426256),
    segment(EarthModel::FaiSphere, CYLINDER, (51.15941004921857, 6.955178971888247), (51.011237433327324, 7.030947037509398), 1.9999999999995928),
    segment(EarthModel::Wgs84, KEYHOLE, (51.00124818615082, 6.988776447160911), (50.9964040207737, 7.009868799077127), 0.0),
    segment(EarthModel::Wgs84, KEYHOLE, (50.982782984418904, 7.022883586008148), (50.99609246853342, 6.964930282863764), 0.0),
    segment(EarthModel::Wgs84, KEYHOLE, (50.9143423528897, 7.0782062456056645), (50.9660889496651, 6.8528569895266696), 0.0),
    segment(EarthModel::Wgs84, KEYHOLE, (50.97300979650304, 6.926021188411932), (51.02322393335445, 6.789458628466328), 0.0),
    segment(EarthModel::Wgs84, KEYHOLE, (51.01062276252503, 6.997030878867873), (51.0069328086595, 7.01309716195733), 0.5392304845407557),
    segment(EarthModel::Wgs84, KEYHOLE, (51.15933144540103, 7.044679791738851), (51.00389700082231, 7.035075601046753), 2.0000000000000657),
    segment(EarthModel::FaiSphere, KEYHOLE, (51.00124878345395, 6.988741089666383), (50.99640229525652, 7.009899885451425), 0.0),
    segment(EarthModel::FaiSphere, KEYHOLE, (50.98277474231885, 7.02295564734677), (50.99609057846369, 6.964819815218897), 0.0),
    segment(EarthModel::FaiSphere, KEYHOLE, (50.91430180459272, 7.078452157617072), (50.966072486524, 6.852393797164337), 0.0),
    segment(EarthModel::FaiSphere, KEYHOLE, (50.9729968357814, 6.925788275229957), (51.02323452447738, 6.788795047588834), 0.0),
    segment(EarthModel::FaiSphere, KEYHOLE, (51.010627868823725, 6.997021523371097), (51.00693613678071, 7.01313842693054), 0.5392304845413434),
    segment(EarthModel::FaiSphere, KEYHOLE, (51.15941004921857, 7.044821028111753), (51.003898855280454, 7.035186105821099), 1.999999999999769),
    segment(EarthModel::Wgs84, SECTOR, (-32.99874711867507, 149.0084302618227), (-32.99874711867507, 148.9915697381773), 0.0),
    segment(EarthModel::Wgs84, SECTOR, (-32.98872687800586, 148.97683559346257), (-32.98872687800586, 149.02316440653743), 0.0),
    segment(EarthModel::Wgs84, SECTOR, (-32.93621260451794, 148.9098967939259), (-32.93621260451794, 149.0901032060741), 0.0),
    segment(EarthModel::Wgs84, SECTOR, (-32.958549566807804, 149.04124977293813), (-32.97641374869799, 149.15802766460865), 0.0),
    segment(EarthModel::Wgs84, SECTOR, (-33.00937033026702, 149.00642100367673), (-33.00937033026702, 148.99357899632327), 1.039230484542503),
    segment(EarthModel::Wgs84, SECTOR, (-33.15982958748349, 149.03350683246828), (-33.01126880244899, 148.97682970220146), 2.4148145657217337),
    segment(EarthModel::FaiSphere, SECTOR, (-32.99875039104619, 149.00844809755915), (-32.99875039104619, 148.99155190244085), 0.0),
    segment(EarthModel::FaiSphere, SECTOR, (-32.98875633191258, 148.97678659054182), (-32.98875633191258, 149.02321340945818), 0.0),
    segment(EarthModel::FaiSphere, SECTOR, (-32.93637949028216, 148.90970629908014), (-32.93637949028216, 149.09029370091986), 0.0),
    segment(EarthModel::FaiSphere, SECTOR, (-32.958657968975814, 149.04133700461338), (-32.97647519545287, 149.15836191606212), 0.0),
    segment(EarthModel::FaiSphere, SECTOR, (-33.00934585924641, 149.00643459009746), (-33.00934585924641, 148.99356540990254), 1.0392304845416864),
    segment(EarthModel::FaiSphere, SECTOR, (-33.159414107708216, 149.03357785148506), (-33.0112393710803, 148.97678067432597), 2.4148145657237388),
    segment(EarthModel::Wgs84, ANNULAR_SECTOR, (-33.00677835588926, 148.99707193550805), (-32.99447407895642, 149.00550219740907), 4.527438472525825),
    segment(EarthModel::Wgs84, ANNULAR_SECTOR, (-32.98872687800586, 149.02316440653743), (-33.02254188465347, 149.0), 3.0982841873185727),
    segment(EarthModel::Wgs84, ANNULAR_SECTOR, (-32.96602785677039, 149.11056507952415), (-33.097675194707975, 149.02046199101113), 0.0),
    segment(EarthModel::Wgs84, ANNULAR_SECTOR, (-33.050835813836855, 149.02197141025877), (-33.12708148868854, 148.94502408344698), 1.0418890660012856),
    segment(EarthModel::Wgs84, ANNULAR_SECTOR, (-32.999999339648184, 148.98715935029844), (-32.99062932547072, 148.99358035366993), 5.6956123463583515),
    segment(EarthModel::Wgs84, ANNULAR_SECTOR, (-32.94435819402908, 148.81911943250503), (-32.97745803382838, 149.0), 5.590169943749409),
    segment(EarthModel::FaiSphere, ANNULAR_SECTOR, (-33.006760652695114, 148.99706574009804), (-32.994488516261235, 149.0055138377359), 4.527438472525655),
    segment(EarthModel::FaiSphere, ANNULAR_SECTOR, (-32.98875633191258, 149.02321340945818), (-33.02248304014797, 149.0), 3.0982841873163256),
    segment(EarthModel::FaiSphere, ANNULAR_SECTOR, (-32.96611658968383, 149.1107989133144), (-33.09742080225946, 149.020505330495), 0.0),
    segment(EarthModel::FaiSphere, ANNULAR_SECTOR, (-33.05070322042736, 149.02201792211727), (-33.126750786719775, 148.94490760306172), 1.0418890660008064),
    segment(EarthModel::FaiSphere, ANNULAR_SECTOR, (-32.99999933997972, 148.98713218320796), (-32.990653810743446, 148.99356677299878), 5.695612346358305),
    segment(EarthModel::FaiSphere, ANNULAR_SECTOR, (-32.944503515723035, 148.81873698246613), (-32.97751695985204, 149.0), 5.590169943749294),
    segment(EarthModel::Wgs84, HALF_DISC_AND_CYLINDER, (64.00706729003069, -20.002839744379045), (63.99293264753541, -20.002838310251118), 0.0),
    segment(EarthModel::Wgs84, HALF_DISC_AND_CYLINDER, (63.980576172478024, -20.025528070743025), (64.01941928168952, -20.025563533052825), 0.0),
    segment(EarthModel::Wgs84, HALF_DISC_AND_CYLINDER, (63.92433867387123, -20.144111083722272), (64.07551675763504, -20.14489180190881), 2.07066370655196),
    segment(EarthModel::Wgs84, HALF_DISC_AND_CYLINDER, (64.0345659973467, -20.09404843671533), (64.13250125036117, -20.05348513396815), 0.9999999999995103),
    segment(EarthModel::Wgs84, HALF_DISC_AND_CYLINDER, (64.00538070428766, -19.97875754372131), (63.994616185814465, -19.978765714233717), 0.5392304845412667),
    segment(EarthModel::Wgs84, HALF_DISC_AND_CYLINDER, (64.02758621555094, -19.637369740598412), (63.980576172478024, -19.974471929256975), 1.250000000000071),
    segment(EarthModel::FaiSphere, HALF_DISC_AND_CYLINDER, (64.00708524318557, -20.002850646802038), (63.992914700961485, -20.002849201643887), 0.0),
    segment(EarthModel::FaiSphere, HALF_DISC_AND_CYLINDER, (63.98052685669803, -20.025625985721582), (64.01946862114222, -20.02566172078059), 0.0),
    segment(EarthModel::FaiSphere, HALF_DISC_AND_CYLINDER, (63.9241466299151, -20.14466272129853), (64.07570867655724, -20.145449444192742), 2.0706637065514752),
    segment(EarthModel::FaiSphere, HALF_DISC_AND_CYLINDER, (64.03465375538647, -20.094409866592816), (64.1328389649623, -20.053691404581798), 1.0000000000003746),
    segment(EarthModel::FaiSphere, HALF_DISC_AND_CYLINDER, (64.0053943664522, -19.978675994049247), (63.99460250783257, -19.978684227403004), 0.5392304845411838),
    segment(EarthModel::FaiSphere, HALF_DISC_AND_CYLINDER, (64.02765459074135, -19.635976502322038), (63.98052685669803, -19.974374014278418), 1.24999999999973),
    segment(EarthModel::Wgs84, CUTOUT, (64.0041155642316, -20.013394537327724), (63.994121176353445, -19.990624393301896), 0.19999999999933996),
    segment(EarthModel::Wgs84, CUTOUT, (63.97833743461291, -19.986786754786404), (64.00579590788902, -20.04936090610167), 0.0),
    segment(EarthModel::Wgs84, CUTOUT, (63.90169874056912, -19.980475702987814), (64.00842734530407, -20.22401544002304), 4.0706637065518505),
    segment(EarthModel::Wgs84, CUTOUT, (63.99525768811063, -20.12213256232117), (64.07696028215287, -20.251804009982976), 2.999999999999874),
    segment(EarthModel::Wgs84, CUTOUT, (64.01039758075765, -19.993650372960087), (64.00278412993198, -19.976309317449275), 0.0),
    segment(EarthModel::Wgs84, CUTOUT, (64.13211140146007, -19.78800282608361), (63.994187317636474, -19.95065956805234), 0.0),
    segment(EarthModel::FaiSphere, CUTOUT, (64.00412601590799, -20.01344595654862), (63.994106246323625, -19.99058841493503), 0.1999999999996411),
    segment(EarthModel::FaiSphere, CUTOUT, (63.97828244552112, -19.98673607838195), (64.00581059862598, -20.04955040515475), 0.0),
    segment(EarthModel::FaiSphere, CUTOUT, (63.90144973925133, -19.980401027016722), (64.00844808951042, -20.22487552631424), 4.070663706552016),
    segment(EarthModel::FaiSphere, CUTOUT, (63.99524544735715, -20.122601258022005), (64.07715532062454, -20.252773171877294), 3.000000000000023),
    segment(EarthModel::FaiSphere, CUTOUT, (64.01042399593852, -19.993625992387354), (64.0027911942804, -19.97621837752383), 0.0),
    segment(EarthModel::FaiSphere, CUTOUT, (64.13244756088231, -19.787185251326022), (63.99417252445477, -19.950470226470777), 0.0),
    segment(EarthModel::Wgs84, PARTIAL_CUTOUT, (51.00589043692527, 7.006537527655347), (50.995874967149994, 6.990665452794118), 0.0),
    segment(EarthModel::Wgs84, PARTIAL_CUTOUT, (50.99417868536384, 6.965604096789272), (51.02170613020211, 7.009221810642879), 0.0),
    segment(EarthModel::Wgs84, PARTIAL_CUTOUT, (50.991277955577054, 6.843925095557093), (51.098500040481184, 7.013686326706453), 0.0),
    segment(EarthModel::Wgs84, PARTIAL_CUTOUT, (51.053727700445776, 6.992541929132328), (51.11038365899445, 7.122854839402455), 0.0),
    segment(EarthModel::Wgs84, PARTIAL_CUTOUT, (50.997207033415094, 7.016511107713407), (50.98958077032988, 7.004423412896599), 1.039230484541298),
    segment(EarthModel::Wgs84, PARTIAL_CUTOUT, (50.907006095698264, 7.20962736638435), (50.97829306152636, 6.9907867910636625), 1.2499999999999896),
    segment(EarthModel::FaiSphere, PARTIAL_CUTOUT, (51.00589326551262, 7.00655812485348), (50.99587298828795, 6.990636049630053), 0.0),
    segment(EarthModel::FaiSphere, PARTIAL_CUTOUT, (50.99417587931358, 6.965495756090724), (51.02171658401842, 7.009250874883844), 0.0),
    segment(EarthModel::FaiSphere, PARTIAL_CUTOUT, (50.9912734488445, 6.843433519727262), (51.098548132549915, 7.013729533323345), 0.0),
    segment(EarthModel::FaiSphere, PARTIAL_CUTOUT, (51.053753726261604, 6.992518407387315), (51.11043746520089, 7.123242781666064), 0.0),
    segment(EarthModel::FaiSphere, PARTIAL_CUTOUT, (50.99720569037082, 7.016563118029373), (50.98957578036516, 7.004437344444145), 1.0392304845420803),
    segment(EarthModel::FaiSphere, PARTIAL_CUTOUT, (50.906961630491985, 7.210286414725865), (50.97828268616986, 6.990757781102426), 1.2500000000005649),
];

#[test]
fn point_distances_match_geographiclib_within_2_mm() {
    for reference in REFERENCE_POINT_DISTANCES {
        let zone = reference.placement.place(reference.earth_model);
        let distance = zone.distance(reference.position);
        assert_abs_diff_eq!(distance, reference.distance, epsilon = 2e-6);
        assert_eq!(zone.contains(reference.position), reference.distance == 0.);
    }
}

#[test]
fn line_distances_match_geographiclib_within_2_mm() {
    for reference in REFERENCE_SEGMENT_DISTANCES {
        let zone = reference.placement.place(reference.earth_model);
        let distance = zone.line_distance(reference.from, reference.to);
        assert_abs_diff_eq!(distance, reference.distance, epsilon = 2e-6);
    }
}

const fn lng_lat(latitude: f64, longitude: f64) -> LngLat {
    LngLat {
        longitude,
        latitude,
    }
}

#[test]
fn the_reference_point_lies_inside_sectors_and_outside_cutouts() {
    for placement in [
        CYLINDER,
        KEYHOLE,
        SECTOR,
        HALF_DISC_AND_CYLINDER,
        PARTIAL_CUTOUT,
    ] {
        let zone = placement.place(EarthModel::Wgs84);
        assert!(zone.contains(placement.reference_point));
    }
    for placement in [ANNULAR_SECTOR, CUTOUT] {
        let zone = placement.place(EarthModel::Wgs84);
        assert!(!zone.contains(placement.reference_point));
    }
}

#[test]
fn a_position_on_an_edge_lies_inside() {
    // The axis points to 315°, so the edges point to 270° and due north.
    let reference_point = lng_lat(51., 7.);
    let shape = TwoArcZone {
        r1: 10.,
        a1: 45.,
        r2: 0.,
        a2: 0.,
    };
    let zone = PlacedZone::new(EarthModel::Wgs84, reference_point, 135., shape);
    assert!(zone.contains(lng_lat(51.05, 7.)));
    assert!(!zone.contains(lng_lat(51.05, 7.0001)));
    assert!(zone.contains(lng_lat(51.05, 6.9999)));
}

#[test]
fn a_sector_straddling_north_contains_both_sides_of_north() {
    let zone = SECTOR.place(EarthModel::Wgs84);
    let (latitude, longitude) = (-33., 149.);
    assert!(zone.contains(lng_lat(latitude + 0.05, longitude - 0.03)));
    assert!(zone.contains(lng_lat(latitude + 0.05, longitude + 0.03)));
    assert!(!zone.contains(lng_lat(latitude + 0.03, longitude + 0.06)));
    assert!(!zone.contains(lng_lat(latitude - 0.01, longitude)));
}

/// 0°N 0°E, where 0.001' is about 1.85 m both ways on the FAI sphere.
const EQUATOR: LngLat = lng_lat(0., 0.);

fn events<'a>(
    igc_file: &'a IgcFile,
    bearing: f64,
    shape: TwoArcZone,
    tolerance: Option<f64>,
) -> Vec<ZoneEvent<'a>> {
    let zone = PlacedZone::new(EarthModel::FaiSphere, EQUATOR, bearing, shape);
    zone_visits(&igc_file.records, &zone, tolerance)
}

fn render(events: &[ZoneEvent]) -> String {
    let crossing = |crossing: &Option<ZoneCrossing>| match crossing {
        None => "-".to_string(),
        Some(crossing) => {
            let time = crossing.time.round(Unit::Millisecond).unwrap();
            let time = time.strftime("%H:%M:%S%.3f");
            let before = crossing.fix_before.time.strftime("%H:%M:%S");
            let after = crossing.fix_after.time.strftime("%H:%M:%S");
            format!("{time} ({before}-{after})")
        }
    };
    let time = |record: &Record| record.time.strftime("%H:%M:%S").to_string();
    let rows = events.iter().map(|event| match event {
        ZoneEvent::Visit(ZoneVisit { entry, exit }) => {
            format!("visit      entry {}  exit {}", crossing(entry), crossing(exit))
        }
        ZoneEvent::NearMiss(NearMiss {
            first_fix,
            last_fix,
            nearest_fix,
            nearest_fix_distance,
            nearest_line: [before, after],
            nearest_line_distance,
        }) => {
            let [first, last, nearest, before, after] =
                [first_fix, last_fix, nearest_fix, before, after].map(|record| time(record));
            format!(
                "near miss  {first}-{last}  nearest fix {nearest} {nearest_fix_distance:.3} km  nearest line {before}-{after} {nearest_line_distance:.3} km"
            )
        }
    });
    rows.collect::<Vec<_>>().join("\n")
}

/// A 10 s logger flying east about 370 m north of the reference point, with
/// every fix more than 500 m from it.
const CYLINDER_PASS: &str = "\
ALXVABC
HFDTE160624
B1000000000200N00000500WA0050000500
B1000100000200N00000500EA0050000500
B1000200000200N00001500EA0050000500
";

#[test]
fn a_line_between_two_fixes_outside_reaches_a_cylinder() {
    let igc_file = parse(CYLINDER_PASS.as_bytes());
    let events = events(&igc_file, 0., TwoArcZone::cylinder(0.5), None);
    assert_snapshot!(render(&events), @"visit      entry 10:00:03.189 (10:00:00-10:00:10)  exit 10:00:06.811 (10:00:00-10:00:10)");
}

/// A 10 s logger flying east about 370 m north of the reference point,
/// ending further from it than it started.
const CYLINDER_MISS: &str = "\
ALXVABC
HFDTE160624
B1000000000200N00000500WA0050000500
B1000100000200N00000600EA0050000500
";

#[test]
fn a_line_that_misses_a_cylinder_is_a_near_miss_within_the_tolerance() {
    let igc_file = parse(CYLINDER_MISS.as_bytes());
    let shape = TwoArcZone::cylinder(0.3);
    assert_snapshot!(render(&events(&igc_file, 0., shape, None)), @"");
    assert_snapshot!(render(&events(&igc_file, 0., shape, Some(0.1))), @"near miss  10:00:00-10:00:10  nearest fix 10:00:00 0.698 km  nearest line 10:00:00-10:00:10 0.071 km");
    assert_snapshot!(render(&events(&igc_file, 0., shape, Some(0.05))), @"");
}

/// A track along the equator that comes within 500 m of a 500 m cylinder,
/// flies through it and stays within 500 m on the way out.
const CYLINDER_APPROACH: &str = "\
ALXVABC
HFDTE160624
B1000000000000N00000700WA0050000500
B1000100000000N00000400WA0050000500
B1000200000000N00000400EA0050000500
B1000300000000N00000700EA0050000500
";

#[test]
fn a_run_within_the_tolerance_that_reaches_the_zone_is_no_near_miss() {
    let igc_file = parse(CYLINDER_APPROACH.as_bytes());
    let events = events(&igc_file, 0., TwoArcZone::cylinder(0.5), Some(0.5));
    assert_snapshot!(render(&events), @"visit      entry 10:00:11.628 (10:00:10-10:00:20)  exit 10:00:18.372 (10:00:10-10:00:20)");
}

/// A track flying east about 5 km north of the reference point, then south
/// and back west about 5 km south of it.
const KEYHOLE_PASSES: &str = "\
ALXVABC
HFDTE160624
B1000000002700N00002000WA0050000500
B1000100002700N00002000EA0050000500
B1000200002700S00002000EA0050000500
B1000300002700S00002000WA0050000500
";

#[test]
fn a_line_reaches_a_keyhole_only_through_its_sector() {
    let igc_file = parse(KEYHOLE_PASSES.as_bytes());
    // The sector points south, away from a task to the north.
    let events = events(&igc_file, 0., TwoArcZone::daec_keyhole(), None);
    assert_snapshot!(render(&events), @"visit      entry 10:00:18.704 (10:00:10-10:00:20)  exit -");
}

/// A track that starts in a 3 km cylinder, flies straight through the 1 km
/// disc cut out of its middle and ends inside again.
const CUTOUT_PASS: &str = "\
ALXVABC
HFDTE160624
B1000000000000N00001000WA0050000500
B1000100000000N00001000EA0050000500
";

#[test]
fn a_track_that_starts_and_ends_inside_can_leave_through_a_cutout() {
    let igc_file = parse(CUTOUT_PASS.as_bytes());
    let shape = TwoArcZone {
        r1: 3.,
        a1: 180.,
        r2: 1.,
        a2: 0.,
    };
    assert_snapshot!(render(&events(&igc_file, 0., shape, None)), @"
    visit      entry -  exit 10:00:02.302 (10:00:00-10:00:10)
    visit      entry 10:00:07.698 (10:00:00-10:00:10)  exit -
    ");
}

/// A track flying south from about 4 km to about 6 km south of the
/// reference point.
const SOUTHWARDS: &str = "\
ALXVABC
HFDTE160624
B1000000002159S00000000EA0050000500
B1000100003238S00000000EA0050000500
";

#[test]
fn a_zone_whose_r1_equals_r2_has_no_arc_at_r1() {
    let igc_file = parse(SOUTHWARDS.as_bytes());
    let shape = TwoArcZone {
        r1: 5.,
        a1: 45.,
        r2: 5.,
        a2: 0.,
    };
    assert_snapshot!(render(&events(&igc_file, 0., shape, None)), @"");
}

/// A track with an invalid fix inside a 500 m cylinder, between valid fixes
/// on either side.
const INVALID_FIX_INSIDE: &str = "\
ALXVABC
HFDTE160624
B1000000000000N00000500WA0050000500
B1000050000000N00000000EV0050000500
B1000100000000N00000500EA0050000500
";

#[test]
fn only_valid_fixes_count() {
    let igc_file = parse(INVALID_FIX_INSIDE.as_bytes());
    let events = events(&igc_file, 0., TwoArcZone::cylinder(0.5), None);
    assert_snapshot!(render(&events), @"visit      entry 10:00:02.302 (10:00:00-10:00:10)  exit 10:00:07.698 (10:00:00-10:00:10)");
}

/// The zone visits and near misses of an IGC fixture at a task point.
fn task_point_events<'a>(
    igc_file: &'a IgcFile,
    task: &Task<f64>,
    point: &TaskPoint<f64>,
    tolerance: Option<f64>,
) -> Vec<ZoneEvent<'a>> {
    let ObservationZone::TwoArc { shape, .. } = point.zone else {
        panic!("a line has no zone visits");
    };
    let (reference_point, bearing) = (point.reference_point, point.direction);
    let zone = PlacedZone::new(task.earth_model, reference_point, bearing, shape);
    zone_visits(&igc_file.records, &zone, tolerance)
}

/// Asserts that an entry rounded up to the second, as SeeYou rounds a
/// finish, is `expected`.
fn assert_entered_at(events: &[ZoneEvent], expected: &str) {
    let expected: Timestamp = expected.parse().unwrap();
    let rounding = TimestampRound::new()
        .smallest(Unit::Second)
        .mode(RoundMode::Ceil);
    let entries = events.iter().filter_map(|event| match event {
        ZoneEvent::Visit(ZoneVisit {
            entry: Some(entry), ..
        }) => Some(entry.time),
        _ => None,
    });
    let times: Vec<_> = entries.map(|time| time.round(rounding).unwrap()).collect();
    assert!(times.contains(&expected), "{expected} is none of {times:?}");
}

/// The task of `junior-world-gliding-championships-2022-tabor-2022/class-standard/2022-07-28`.
fn tabor_task() -> Task<f64> {
    let points = [
        (0.257760986798243, 0.863302970777676, line(7.5)),
        (0.270142934288308, 0.863477503702875, cylinder(0.5)),
        (0.240288204768319, 0.865101532571856, cylinder(0.5)),
        (0.267457163457698, 0.860641343668384, cylinder(0.5)),
        (0.256611978374014, 0.862090839612166, reducing_cylinder(5.)),
    ];
    seeyou_task(TaskKind::Racing, &points, EarthModel::FaiSphere)
}

/// The task of `wgc2021-club-std-15m-montlucon-gueret-2021/club/2021-08-11`.
fn montlucon_task() -> Task<f64> {
    let points = [
        (0.0402821991360291, 0.808106351406938, line(5.)),
        (0.0448936499080068, 0.809023231040652, cylinder(0.5)),
        (0.0434732427850921, 0.815534181815217, cylinder(0.5)),
        (0.0398612838980898, 0.814041052640136, cylinder(0.5)),
        (0.0343152093116692, 0.815601958767836, cylinder(0.5)),
        (0.0412383486779134, 0.806797936244359, reducing_cylinder(5.)),
    ];
    seeyou_task(TaskKind::Racing, &points, EarthModel::Wgs84)
}

/// The track enters the sector of the keyhole about 3.6 km from the
/// turnpoint, far outside its 500 m cylinder.
#[test]
fn keyhole_sector_entry_with_a_2_s_logger() {
    let igc_file = parse(include_bytes!("fixtures/keyhole.igc"));
    let task = edpa_task();
    let events = task_point_events(&igc_file, &task, &task.turnpoints[3], None);
    assert_snapshot!(render(&events), @"visit      entry 11:27:47.553 (11:27:47-11:27:49)  exit -");
}

#[test]
fn finish_cylinder_entry_with_a_2_s_logger() {
    let igc_file = parse(include_bytes!("fixtures/finish-cylinder-2s-logger.igc"));
    let task = edpa_task();
    let events = task_point_events(&igc_file, &task, &task.finish, None);
    assert_snapshot!(render(&events), @"visit      entry 13:48:27.089 (13:48:26-13:48:28)  exit -");
    assert_entered_at(&events, "2023-06-04T13:48:28Z");
}

#[test]
fn finish_cylinder_entry_with_a_4_s_logger() {
    let igc_file = parse(include_bytes!("fixtures/finish-cylinder-4s-logger.igc"));
    let task = tocumwal_task();
    let events = task_point_events(&igc_file, &task, &task.finish, None);
    assert_snapshot!(render(&events), @"visit      entry 06:52:04.993 (06:52:03-06:52:07)  exit -");
    assert_entered_at(&events, "2019-12-16T06:52:05Z");
}

/// The second visit lies on the line between two fixes outside the
/// cylinder.
#[test]
fn visits_of_a_500_m_cylinder_with_a_1_s_logger() {
    let igc_file = parse(include_bytes!("fixtures/cylinder-500m.igc"));
    let task = tabor_task();
    let events = task_point_events(&igc_file, &task, &task.turnpoints[0], None);
    assert_snapshot!(render(&events), @"
    visit      entry 12:14:48.118 (12:14:48-12:14:49)  exit 12:14:49.921 (12:14:49-12:14:50)
    visit      entry 12:14:50.270 (12:14:50-12:14:51)  exit 12:14:50.658 (12:14:50-12:14:51)
    visit      entry 12:14:53.453 (12:14:53-12:14:54)  exit 12:15:02.326 (12:15:02-12:15:03)
    ");
}

/// The published results penalise this turnpoint as "missed by 27m".
#[test]
fn near_miss_of_a_500_m_cylinder() {
    let igc_file = parse(include_bytes!("fixtures/turnpoint-near-miss.igc"));
    let task = montlucon_task();
    let events = task_point_events(&igc_file, &task, &task.turnpoints[3], Some(0.1));
    assert_snapshot!(render(&events), @"near miss  15:02:49-15:02:58  nearest fix 15:02:54 0.027 km  nearest line 15:02:53-15:02:54 0.027 km");
}
