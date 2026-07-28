/**
 * Entrada asíncrona.
 *
 * Module Federation necesita que el arranque sea diferido: el contenedor debe
 * negociar primero las dependencias compartidas (React) con los remotos, antes
 * de que se evalúe el primer módulo que las importa.
 */
import('./bootstrap');

export {};
