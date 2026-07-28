/**
 * Entrada asíncrona.
 *
 * Module Federation necesita que el arranque sea diferido para poder negociar
 * primero las dependencias compartidas (React) con el host.
 */
import('./bootstrap');

export {};
