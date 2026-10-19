// Containers we accept on import. Listing them (instead of ALL_FORMATS)
// keeps unused demuxers like HLS / MPEG-TS out of the editor bundle.
import { MATROSKA, MP4, QTFF, WEBM } from "mediabunny";

// MP4 / MOV cover Android and iPhone recordings; WebM / MKV cover screen recorders.
export const VIDEO_FORMATS = [MP4, QTFF, WEBM, MATROSKA];
